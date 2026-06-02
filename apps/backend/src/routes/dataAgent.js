import { Router } from "express";
import { ChatGroq } from "@langchain/groq";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const dataAgentRouter = Router();

// Store datasets in memory per request session (for simplicity during testing)
const sessionDatasets = new Map();

dataAgentRouter.post("/upload-dataset", async (req, res) => {
  try {
    const { datasetId, data } = req.body; // data is an array of objects
    
    if (!datasetId || !data) {
      return res.status(400).json({ error: "Missing datasetId or data" });
    }

    // MASKING ENGINE: Mask PII before it even enters the agent's memory
    let userCounter = 1;
    const userMap = new Map();

    const maskedData = data.map(row => {
      const newRow = { ...row };
      
      // Attempt to find name columns
      const fNameKey = Object.keys(newRow).find(k => k.toLowerCase().includes("first name"));
      const lNameKey = Object.keys(newRow).find(k => k.toLowerCase().includes("last name"));
      const emailKey = Object.keys(newRow).find(k => k.toLowerCase().includes("email"));

      let fullName = "";
      if (fNameKey && newRow[fNameKey]) fullName += newRow[fNameKey];
      if (lNameKey && newRow[lNameKey]) fullName += " " + newRow[lNameKey];
      fullName = fullName.trim();

      if (fullName) {
        if (!userMap.has(fullName)) {
          userMap.set(fullName, `User_${userCounter++}`);
        }
        const maskedName = userMap.get(fullName);
        if (fNameKey) newRow[fNameKey] = maskedName;
        if (lNameKey) newRow[lNameKey] = "[MASKED]";
      }

      if (emailKey && newRow[emailKey]) {
        newRow[emailKey] = "[MASKED_EMAIL]";
      }

      return newRow;
    });

    sessionDatasets.set(datasetId, maskedData);

    const schema = maskedData.length > 0 ? Object.keys(maskedData[0]) : [];

    res.json({
      success: true,
      message: "Dataset masked and stored in memory.",
      maskedRecords: maskedData.length,
      schema: schema
    });

  } catch (error) {
    console.error("[Data Agent] Upload Error:", error);
    res.status(500).json({ error: error.message });
  }
});

dataAgentRouter.post("/analyze", async (req, res) => {
  try {
    const { datasetId, query } = req.body;
    
    if (!datasetId || !query) {
      return res.status(400).json({ error: "Missing datasetId or query" });
    }

    const data = sessionDatasets.get(datasetId);
    if (!data) {
      return res.status(404).json({ error: "Dataset not found. Please upload it first." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server." });
    }

    console.log(`[Data Agent] Starting recursive analysis on dataset ${datasetId}`);

    // Tool: Query Dataset
    const queryDatasetTool = new DynamicStructuredTool({
      name: "query_dataset",
      description: "Query the dataset by providing a group-by column and optionally a filter. Returns the top frequency counts.",
      schema: z.object({
        groupByColumn: z.string().describe("The exact name of the column you want to group by (e.g. 'Company', 'Position')"),
        filterColumn: z.string().optional().describe("An optional column to filter on"),
        filterValue: z.string().optional().describe("The value that filterColumn must match exactly")
      }),
      func: async ({ groupByColumn, filterColumn, filterValue }) => {
        try {
          let workingData = data;
          
          if (filterColumn && filterValue) {
            workingData = workingData.filter(row => String(row[filterColumn]) === filterValue);
          }

          const counts = {};
          workingData.forEach(row => {
            const val = String(row[groupByColumn] || "Unknown");
            counts[val] = (counts[val] || 0) + 1;
          });

          const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([val, count]) => `${val}: ${count}`);

          return `Results (Top 20):\n${sorted.join("\n")}\n\nTotal rows matched: ${workingData.length}`;
        } catch (e) {
          return `Error executing query: ${e.message}`;
        }
      }
    });

    const tools = [queryDatasetTool];
    const toolsMap = { query_dataset: queryDatasetTool };

    const model = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      modelName: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });

    const modelWithTools = model.bindTools(tools);

    const schemaStr = Object.keys(data[0] || {}).join(", ");
    
    let messages = [
      new SystemMessage(`You are an elite Autonomous Data Analyst Agent. 
You have access to a dataset with schema: [${schemaStr}]. Records: ${data.length}. PII has been masked.
Iteratively use your 'query_dataset' tool to explore. 
Do not assume values! Query them first. 
When you have enough deep insights, synthesize your findings into a comprehensive Markdown report directly addressing the user's query.`),
      new HumanMessage(query)
    ];

    console.log("[Data Agent] Executing Agent Loop...");
    let iterations = 0;
    const maxIterations = 10;
    
    while (iterations < maxIterations) {
      iterations++;
      console.log(`[Data Agent] Iteration ${iterations}`);
      
      const response = await modelWithTools.invoke(messages);
      messages.push(response);
      
      if (!response.tool_calls || response.tool_calls.length === 0) {
        // Agent finished
        return res.json({
          success: true,
          report: response.content
        });
      }
      
      for (const toolCall of response.tool_calls) {
        console.log(`[Data Agent] Executing Tool: ${toolCall.name} with args:`, toolCall.args);
        const tool = toolsMap[toolCall.name];
        if (tool) {
          const toolResult = await tool.func(toolCall.args);
          messages.push(new ToolMessage({
            tool_call_id: toolCall.id,
            content: toolResult
          }));
        } else {
          messages.push(new ToolMessage({
            tool_call_id: toolCall.id,
            content: "Error: Tool not found."
          }));
        }
      }
    }

    res.json({
      success: true,
      report: messages[messages.length - 1].content || "Max iterations reached without a final report."
    });

  } catch (error) {
    console.error("[Data Agent] Error:", error);
    res.status(500).json({ error: error.message });
  }
});
