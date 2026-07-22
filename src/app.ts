import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
