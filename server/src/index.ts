import express, { type Express } from "express";
import { PORT } from "./config.js";
export const app: Express = express();
import { Checkout } from "./db/query/queryCheckout.js";
import database from "./db/Database.js";
import { testingFunction } from "./queue/queue.js";

app.use(express.json());
app.get('/', (req, res) => {
  testingFunction();
res.json({message:"server is working "})
});

app.post("/api/orders/checkout",async (req,res)=>{
  const {userId, productId, quantity} =req.body; 
  if(!userId || !productId || !quantity){ return res.json({result:"Please provide all details "}) } 
   const client = await database.getClient();
   try {
     const result = await Checkout(client,{userId, productId, quantity});
     res.status(result.status).json(result);
   } finally {
     client.release(); 
   }
})

app.listen(PORT, () => {
  console.log(`StreamGrabber API listening on http://localhost:${PORT}`);
});
