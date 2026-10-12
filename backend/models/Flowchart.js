import mongoose from "mongoose";

const flowchartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  userName: {
    type: String,
    default: "Guest",
    trim: true,
  },
  userEmail: {
    type: String,
    default: "",
    trim: true,
  },
  inputType: {
    type: String,
    enum: ["text", "image"],
    required: true,
  },
  algorithm: {
    type: String,
    default: "",
  },
  imageFileName: {
    type: String,
    default: "",
  },
  imageData: {
    type: String,
    default: "",
  },
  nodes: {
    type: Array,
    default: [],
  },
  edges: {
    type: Array,
    default: [],
  },
  variables: {
    type: Array,
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Flowchart =
  mongoose.models.Flowchart || mongoose.model("Flowchart", flowchartSchema);
