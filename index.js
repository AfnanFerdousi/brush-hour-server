const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gauuv.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// console.log("url",uri);

client.connect(() => {
    console.log('connected');
})

//  JSON WEB TOKEN

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}



async function run() {
    try {
        await client.connect();

        // ALL COLLECTIONS
        const toolsCollection = client.db('brush_hour').collection('toolCollections');
        const userCollection = client.db('brush_hour').collection('users');
        const purchaseCollection = client.db('brush_hour').collection('purchases');
        const ratingCollection = client.db('brush_hour').collection('ratings');
        const paymentCollection = client.db('brush_hour').collection('payments');

        // Check Admin
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // Making Payment
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const product = req.body;
            const price = product.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // Update Payment status
        app.patch('/payment/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    pending: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedPurchases = await purchaseCollection.updateOne(filter, updatedDoc);
            res.send(updatedPurchases);
        })

        // Updating Payment status in the UI
        app.put('/pending/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    pending: false
                }
            }
            const result = await purchaseCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        // Showing 6 tool card in Home page
        app.get('/tools/home', async (req, res) => {
            const query = {};
            const limit = 6;
            const cursor = toolsCollection.find(query).limit(limit);
            const tool = await cursor.toArray();
            res.send(tool);
        })
        
        // Getting all tools to show in Tools page
        app.get('/tools', async (req, res) => {
            const query = {};
            const cursor = toolsCollection.find(query);
            const tool = await cursor.toArray();
            res.send(tool);
        });
        
        // Deleting certain tool from UI and database
        app.delete("/tools/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await toolsCollection.deleteOne(filter);
            res.send(result)
        })

        // Adding new tool in UI and database
        app.post('/tools', verifyJWT, verifyAdmin, async (req, res) => {
            const tool = req.body;
            const result = await toolsCollection.insertOne(tool);
            res.send(result);
        });

        app.get('/user', async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        // I forgot what this is, I'm just not deleting it for safety reasons
        app.delete("/user/:email", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await userCollection.deleteOne(filter);
            res.send(result)
        })

        // Updating My profile in Dashboard
        app.post("/myProfile/:email", async (req, res) => {
            const email = req.params.email;
            const changes = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updatedDoc = {
                $set: changes
            }
            const updatedUser = await userCollection.updateOne(filter, updatedDoc, options);
            res.send(updatedUser)
        })

        // I forgot what this is too
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };

            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token });
        })

        // Getting data for my profile
        app.get("/user/:email",  async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await userCollection.findOne(query);
            res.send(result)
        })

        // Making admin
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        })

        // use admin hook
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // Getting purchase orders to show in manage order
        app.get('/purchase', async (req, res) => {
            const purchase = await purchaseCollection.find().toArray();
            res.send(purchase);
        });

        // Getting data for purchase tool
        app.get('/purchase/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const item = await toolsCollection.findOne(query);
            res.send(item);
        });

        // Getting data for payment 
        app.get("/payment/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const purchase = await purchaseCollection.findOne(query);
            res.send(purchase)
        })


        // app.put("/purchase/:id", async (req, res) => {
        //     const id = req.params.id;
        //     const updatedQuantity = req.body;
        //     const filter = { _id: ObjectId(id) }
        //     const options = { upsert: true };
        //     const updatedDoc = {
        //         $set: {
        //             quantity: updatedQuantity.quantity
        //         },
        //     };
        //     const result = toolsCollection.updateOne(filter, updatedDoc, options);
        //     res.send({ result })
        // })

        // Create Order

        // Making an Order
        app.post("/purchase", verifyJWT, async (req, res) => {
            const purchase = req.body;
            const result = await purchaseCollection.insertOne(purchase);
            return res.send({ success: true, result: result })
        })

        //  My order delete
        app.delete("/purchase/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await purchaseCollection.deleteOne(filter);
            res.send(result)
        })

        // Getting my order
        app.get('/myOrder', async (req, res) => {
            const email = req.query.email;
            const query = { buyerEmail: email };
            const tool = await purchaseCollection.find(query).toArray();
            res.send(tool);
        })

        // Creating Review
        app.post("/review", verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await ratingCollection.insertOne(review);
            return res.send({ success: true, result: result })
        })

        // Getting my reviews
        app.get('/review', async (req, res) => {
            const query = {};
            const cursor = ratingCollection.find(query);
            const review = await cursor.toArray();
            res.send(review);
        })


    } finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello From Brush Hour!')
})

app.listen(port, () => {
    console.log(`Brush Hour listening on port ${port}`)
})
