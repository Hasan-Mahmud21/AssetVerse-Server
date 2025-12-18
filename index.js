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

// verifyToken
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: "Unauthorized" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized" });
  }
};

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
    const packagesCollection = db.collection("packages");

    const verifyHR = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.email });
      if (!user || user.role !== "hr") {
        return res.status(403).send({ message: "Forbidden" });
      }
      next();
    };

    const verifyEmployee = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.email });
      if (!user || user.role !== "employee") {
        return res.status(403).send({ message: "Forbidden" });
      }
      next();
    };

    app.get("/", (req, res) => {
      res.send("Asset Verse API");
    });

    app.get("/users", async (req, res) => {
      const { email } = req.query;

      if (!email) {
        return res.status(400).send({ message: "Email required" });
      }

      const user = await usersCollection.findOne({ email });
      res.send(user);
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
      res.send(user);
    });

    app.get("/users", async (req, res) => {
      const { email } = req.query;

      if (!email) {
        return res.status(400).send({ message: "Email query required" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send(user);
    });

    // Keep writing new APIs here...

    // Add Asset

    app.post("/assets", async (req, res) => {
      try {
        const asset = req.body;

        // ✅ normalize keys (so frontend can send productName OR name etc.)
        const name =
          asset.name || asset.productName || asset.assetName || asset.title;

        const type = asset.type || asset.productType || asset.assetType;

        const image = asset.image || asset.productImage || asset.assetImage;

        const quantity = Number(asset.quantity ?? asset.productQuantity ?? 0);

        const hrEmail = asset.hrEmail;

        if (
          !name ||
          !type ||
          !image ||
          !hrEmail ||
          !Number.isFinite(quantity)
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Missing required asset fields (name/type/image/hrEmail/quantity)",
          });
        }

        // ✅ Pull companyName from HR user (more reliable)
        const hrUser = await usersCollection.findOne({ email: hrEmail });

        const newAsset = {
          assetName: name,
          assetType: type,
          image,
          quantity,
          hrEmail,
          companyName: hrUser?.companyName || "Unknown",
          status: "available",
          createdAt: new Date(),
        };

        const result = await assetsCollection.insertOne(newAsset);

        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
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
          .project({
            assetName: 1,
            assetType: 1,
            image: 1,
            quantity: 1,
            hrEmail: 1,
          })

          .toArray();

        res.send(assets);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Request asset
    // app.post("/asset-requests", async (req, res) => {
    //   try {
    //     const { assetId, assetName, employeeEmail, hrEmail, note } = req.body;

    //     // 🔒 1. Check if already requested (pending)
    //     const existingRequest = await assetRequestsCollection.findOne({
    //       assetId: new ObjectId(assetId),
    //       employeeEmail,
    //       status: "pending",
    //     });

    //     if (existingRequest) {
    //       return res.status(400).send({
    //         success: false,
    //         message: "You already requested this asset",
    //       });
    //     }

    //     // 2. Create new request
    //     const newRequest = {
    //       assetId: new ObjectId(assetId),
    //       assetName,
    //       employeeEmail,
    //       hrEmail,
    //       note, // 🔥 ADD THIS
    //       requestDate: new Date(),
    //       status: "pending",
    //     };

    //     const result = await assetRequestsCollection.insertOne(newRequest);

    //     res.send({
    //       success: true,
    //       insertedId: result.insertedId,
    //     });
    //   } catch (error) {
    //     res.status(500).send({
    //       success: false,
    //       message: error.message,
    //     });
    //   }
    // });
    app.post("/asset-requests", async (req, res) => {
      try {
        const { assetId, employeeEmail, note } = req.body;

        // 1️⃣ Fetch asset
        const asset = await assetsCollection.findOne({
          _id: new ObjectId(assetId),
        });

        if (!asset) {
          return res.status(404).send({ message: "Asset not found" });
        }

        // 2️⃣ Fetch HR (for companyName)
        const hrUser = await usersCollection.findOne({
          email: asset.hrEmail,
        });

        // 3️⃣ Prevent duplicate request
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

        // 4️⃣ Create request with FULL DATA
        const newRequest = {
          assetId: new ObjectId(assetId),
          assetName: asset.assetName, // now guaranteed
          assetType: asset.assetType,
          companyName: hrUser?.companyName || "Unknown",
          employeeEmail,
          hrEmail: asset.hrEmail,
          note,
          requestDate: new Date(),
          status: "pending",
        };

        await assetRequestsCollection.insertOne(newRequest);

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ message: error.message });
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

        const assetUpdate = await assetsCollection.updateOne(
          { _id: request.assetId, quantity: { $gt: 0 } },
          { $inc: { quantity: -1 } }
        );

        if (!assetUpdate.modifiedCount) {
          return res.status(400).send({ message: "Asset unavailable" });
        }

        await assetRequestsCollection.updateOne(
          { _id: new ObjectId(requestId) },
          { $set: { status: "approved", approvedDate: new Date() } }
        );

        const employee = await usersCollection.findOne({
          email: request.employeeEmail,
        });

        const isFirstTime = !employee?.hrEmail;

        await usersCollection.updateOne(
          { email: request.employeeEmail },
          {
            $set: { hrEmail: request.hrEmail },
            $addToSet: {
              assignedAssets: {
                assetId: request.assetId,
                assetName: request.assetName,
                assetType: request.assetType,
                companyName: request.companyName,
                assignedDate: new Date(),
                status: "approved",
              },
            },
          }
        );

        if (isFirstTime) {
          await usersCollection.updateOne(
            { email: request.hrEmail },
            { $inc: { currentEmployees: 1 } }
          );
        }

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
    // Get employees under an HR
    app.get("/hr/:email/employees", async (req, res) => {
      try {
        const hrEmail = req.params.email;

        const employees = await usersCollection
          .find({ role: "employee", hrEmail })
          .project({
            name: 1,
            email: 1,
            photoURL: 1,
            assignedAssets: 1,
            createdAt: 1,
          })
          .toArray();

        const formatted = employees.map((emp) => ({
          _id: emp._id,
          name: emp.name,
          email: emp.email,
          photo: emp.photoURL || null,
          joinDate: emp.createdAt,
          assetsCount: emp.assignedAssets?.length || 0,
        }));

        res.send(formatted);
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

    // fetch packages

    app.get("/packages", async (req, res) => {
      const packages = await packagesCollection.find().toArray();
      res.send(packages);
    });

    // Upgrade HR package after payment success
    // app.patch("/users/upgrade-package", async (req, res) => {
    //   try {
    //     const { email, plan } = req.body;

    //     const pkg = await packagesCollection.findOne({ name: plan });

    //     if (!pkg) {
    //       return res.status(404).send({ message: "Package not found" });
    //     }

    //     const result = await usersCollection.updateOne(
    //       { email },
    //       {
    //         $set: {
    //           subscription: pkg.name,
    //           packageLimit: pkg.employeeLimit,
    //           updatedAt: new Date(),
    //         },
    //       }
    //     );

    //     res.send({
    //       success: true,
    //       message: "Package upgraded successfully",
    //       package: pkg.name,
    //       employeeLimit: pkg.employeeLimit,
    //     });
    //   } catch (error) {
    //     res.status(500).send({ message: error.message });
    //   }
    // });

    app.patch("/users/upgrade-package", async (req, res) => {
      try {
        const { plan } = req.body;

        const pkg = await packagesCollection.findOne({ name: plan });
        if (!pkg) {
          return res.status(404).send({ message: "Package not found" });
        }

        // TEMP: identify HR by email from frontend later (secure version later)
        const email = req.body.email;

        await usersCollection.updateOne(
          { email },
          {
            $set: {
              subscription: plan,
              packageLimit: pkg.employeeLimit,
            },
          }
        );

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // stipe payment checkout
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { email, plan } = req.body;

        const pkg = await packagesCollection.findOne({ name: plan });
        if (!pkg) return res.status(404).send({ message: "Package not found" });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: email,
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `${pkg.name.toUpperCase()} Package`,
                },
                unit_amount: pkg.price,
              },
              quantity: 1,
            },
          ],
          success_url: `${process.env.CLIENT_URL}/payment-success?plan=${pkg.name}`,

          cancel_url: `${process.env.CLIENT_URL}/hr/upgrade`,
        });

        res.send({ url: session.url });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // PAYMENT SUCCESS - UPDATE HR PACKAGE
    app.patch("/payment-success", async (req, res) => {
      try {
        const { email, plan } = req.body;

        // 1. Find package
        const pkg = await packagesCollection.findOne({ name: plan });
        if (!pkg) {
          return res.status(404).send({ message: "Package not found" });
        }

        // 2. Update HR user
        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              packageLimit: pkg.employeeLimit,
              subscription: pkg.name,
              updatedAt: new Date(),
            },
          }
        );

        res.send({
          success: true,
          message: "Package upgraded successfully",
          result,
        });
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
