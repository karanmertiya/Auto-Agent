import { Router } from "express";
import { ChatGroq } from "@langchain/groq";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import * as cheerio from "cheerio";

export const ragRouter = Router();

// Autonomous Web Scraper + RAG Endpoint
ragRouter.post("/analyze", async (req, res) => {
  try {
    const { url, query } = req.body;
    
    if (!url || !query) {
      return res.status(400).json({ error: "Missing 'url' or 'query' in request body." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server." });
    }

    console.log(`[RAG Agent] Scraping URL: ${url}`);
    
    // 1. Scrape the content
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);
    const html = await response.text();
    
    const $ = cheerio.load(html);
    // Remove scripts and styles
    $('script, style').remove();
    let textContent = $('body').text().replace(/\s+/g, ' ').trim();
    
    // Truncate to context window limits
    if (textContent.length > 25000) {
      textContent = textContent.substring(0, 25000) + "...";
    }
    
    console.log(`[RAG Agent] Extracted ${textContent.length} characters. Sending to Groq Llama-3...`);

    // 2. Langchain RAG pipeline
    const model = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      modelName: "llama-3.1-8b-instant",
      temperature: 0.1,
    });

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", "You are an autonomous AI Agent that extracts structured intelligence from raw web text. Analyze the following context to answer the user's query perfectly. If the answer is not in the text, state that."],
      ["user", "Context:\n{context}\n\nQuery:\n{query}"]
    ]);

    const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

    const result = await chain.invoke({
      context: textContent,
      query: query
    });

    console.log("[RAG Agent] Analysis Complete.");

    res.json({
      success: true,
      url: url,
      extracted_length: textContent.length,
      analysis: result
    });

  } catch (error) {
    console.error("[RAG Agent] Error:", error);
    res.status(500).json({ error: error.message });
  }
});
