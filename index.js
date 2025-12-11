const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.478fouv.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("AssetVerseDB");
    // Collections
    const usersCollection = db.collection("users");

    app.get("/", (req, res) => {
      res.send("Asset Verse API");
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // HR REGISTER API
    app.post("/users/hr", async (req, res) => {
      try {
        const user = req.body;

        const exists = await usersCollection.findOne({ email: user.email });
        if (exists) {
          return res.send({ success: false, message: "Email already exists" });
        }

        const result = await usersCollection.insertOne(user);

        res.send({
          success: true,
          message: "HR user saved successfully",
          data: result,
        });
      } catch (error) {
        console.log(error);
        res.send({
          success: false,
          message: "Failed to save HR user",
          error: error.message,
        });
      }
    });

    // USER REGISTER - EMPLOYEE

    app.post("/users/employee", async (req, res) => {
      const user = req.body;

      const exists = await usersCollection.findOne({ email: user.email });
      if (exists) {
        return res.send({ message: "Email already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // ----------------------
    // GET USER BY EMAIL
    // ----------------------
    app.get("/users/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      if (!user) return res.send({ success: false });
      res.send(user);
    });

    // Keep writing new APIs here...

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
