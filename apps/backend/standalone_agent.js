import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { dataAgentRouter } from "./src/routes/dataAgent.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api/data-agent", dataAgentRouter);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Standalone Data Agent running on port ${PORT}`);
});
