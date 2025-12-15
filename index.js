const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
//  const { ObjectId } = require("mongodb");

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
    const assetsCollection = db.collection("assets");
    const assetRequestsCollection = db.collection("assetRequests");

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

      const employeeUser = {
        ...user,
        role: "employee",
        assignedAssets: [],
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(employeeUser);
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

    // Add Asset

    app.post("/assets", async (req, res) => {
      try {
        console.log("Incoming asset data:", req.body);

        const asset = req.body;

        const newAsset = {
          ...asset,
          status: "available",
          createdAt: new Date(),
        };

        const result = await assetsCollection.insertOne(newAsset);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("ADD ASSET ERROR:", error);

        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Get all assets for a specific HR
    app.get("/assets", async (req, res) => {
      try {
        const { hrEmail } = req.query;

        if (!hrEmail) {
          return res.status(400).send({
            success: false,
            message: "hrEmail query is required",
          });
        }

        const assets = await assetsCollection
          .find({ hrEmail })
          .sort({ createdAt: -1 })
          .toArray();

        res.send({
          success: true,
          assets,
        });
      } catch (error) {
        console.error("GET ASSETS ERROR:", error);
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Delete asset
    app.delete("/assets/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await assetsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send({
          success: result.deletedCount > 0,
        });
      } catch (error) {
        console.error("DELETE ASSET ERROR:", error);
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Get employee assigned assets
    app.get("/employees/:email/assets", async (req, res) => {
      try {
        const email = req.params.email;

        const employee = await usersCollection.findOne(
          { email },
          { projection: { assignedAssets: 1 } }
        );

        if (!employee) {
          return res.status(404).send({ message: "Employee not found" });
        }

        res.send(employee.assignedAssets || []);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Get available assets (for employees)
    app.get("/assets/available", async (req, res) => {
      try {
        const assets = await assetsCollection
          .find({ quantity: { $gt: 0 } })
          .toArray();

        res.send(assets);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Request asset
    app.post("/asset-requests", async (req, res) => {
      try {
        const { assetId, assetName, employeeEmail, hrEmail, note } = req.body;

        // 🔒 1. Check if already requested (pending)
        const existingRequest = await assetRequestsCollection.findOne({
          assetId: new ObjectId(assetId),
          employeeEmail,
          status: "pending",
        });

        if (existingRequest) {
          return res.status(400).send({
            success: false,
            message: "You already requested this asset",
          });
        }

        // 2. Create new request
        const newRequest = {
          assetId: new ObjectId(assetId),
          assetName,
          employeeEmail,
          hrEmail,
          note, // 🔥 ADD THIS
          requestDate: new Date(),
          status: "pending",
        };

        const result = await assetRequestsCollection.insertOne(newRequest);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Get all asset requests for HR
    app.get("/asset-requests/hr/:email", async (req, res) => {
      try {
        const hrEmail = req.params.email;

        const requests = await assetRequestsCollection
          .find({ hrEmail })
          .sort({ requestDate: -1 })
          .toArray();

        res.send(requests);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Approve request
    app.patch("/asset-requests/approve/:id", async (req, res) => {
      try {
        const requestId = req.params.id;

        const request = await assetRequestsCollection.findOne({
          _id: new ObjectId(requestId),
        });

        if (!request || request.status !== "pending") {
          return res.status(400).send({ message: "Invalid request" });
        }

        // 1️⃣ Deduct asset quantity
        await assetsCollection.updateOne(
          { _id: request.assetId, quantity: { $gt: 0 } },
          { $inc: { quantity: -1 } }
        );

        // 2️⃣ Update request status
        await assetRequestsCollection.updateOne(
          { _id: new ObjectId(requestId) },
          { $set: { status: "approved" } }
        );

        // 3️⃣ Assign asset to employee
        await usersCollection.updateOne(
          { email: request.employeeEmail },
          {
            $addToSet: {
              assignedAssets: {
                assetId: request.assetId,
                assetName: request.assetName,
                assignedDate: new Date(),
              },
            },
          }
        );

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Reject Request
    app.patch("/asset-requests/reject/:id", async (req, res) => {
      try {
        const requestId = req.params.id;

        await assetRequestsCollection.updateOne(
          { _id: new ObjectId(requestId) },
          { $set: { status: "rejected" } }
        );

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Get employee assigned assets
    app.get("/employees/:email/assets", async (req, res) => {
      try {
        const email = req.params.email;

        const employee = await usersCollection.findOne(
          { email },
          { projection: { assignedAssets: 1 } }
        );

        if (!employee) {
          return res.status(404).send({ message: "Employee not found" });
        }

        res.send(employee.assignedAssets || []);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Get employees under an HR
    app.get("/hr/:email/employees", async (req, res) => {
      try {
        const hrEmail = req.params.email;

        const employees = await usersCollection
          .find({ role: "employee", hrEmail })
          .project({
            name: 1,
            email: 1,
            assignedAssets: 1,
            createdAt: 1,
          })
          .toArray();

        res.send(employees);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Remove employee from HR team
    app.patch("/hr/remove-employee", async (req, res) => {
      try {
        const { employeeEmail } = req.body;

        const result = await usersCollection.updateOne(
          { email: employeeEmail },
          {
            $unset: { hrEmail: "" },
            $set: { assignedAssets: [] },
          }
        );

        res.send({ success: result.modifiedCount > 0 });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

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
