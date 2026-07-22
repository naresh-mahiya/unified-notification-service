import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { notFoundHandler } from "./middlewares/not-found.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { notificationRouter } from "./notifications/notification.routes.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/notifications", notificationRouter);

app.use(notFoundHandler);
app.use(errorHandler);
