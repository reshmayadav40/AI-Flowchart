// import dotenv from "dotenv";
// dotenv.config();

// import Groq from "groq-sdk";

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY,
// });

// export async function runFlowchartAI(payload) {
//   const response = await groq.chat.completions.create({
//     messages: [
//       {
//         role: "system",
//         content: `
// You are an educational AI that simulates algorithm flowcharts.
// Return ONLY valid JSON.
// No explanation.
// No markdown.

// Format:
// {
//   "digital_flowchart": [],
//   "dry_run": [
//     {
//       "step_number": 1,
//       "description": "",
//       "variable_state": {}
//     }
//   ],
//   "result": "TRUE",
//   "error_step": null
// }
// `
//       },
//       {
//         role: "user",
//         content: JSON.stringify(payload),
//       },
//     ],
//     model: "llama-3.1-8b-instant",
//   });

//   const text = response.choices[0].message.content;

//   const cleaned = text
//     .replace(/```json/g, "")
//     .replace(/```/g, "")
//     .trim();

//   return JSON.parse(cleaned);
// }
