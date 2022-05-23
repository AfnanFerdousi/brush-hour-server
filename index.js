const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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
        //   all collections
        const toolsCollection = client.db('brush_hour').collection('toolCollections');
        const userCollection = client.db('brush_hour').collection('users');
        const purchaseCollection = client.db('brush_hour').collection('purchases');



        // Home page 6 cards
        app.get('/tools/home', async (req, res) => {
            const query = {};
            const limit = 6;
            const cursor = toolsCollection.find(query).limit(limit);
            const tool = await cursor.toArray();
            res.send(tool);
        })

        app.get('/tools', async (req, res) => {
            const query = {};
            const cursor = toolsCollection.find(query);
            const tool = await cursor.toArray();
            res.send(tool);
        })

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

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.get('/purchase/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const item = await toolsCollection.findOne(query);
            res.send(item);
        });
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
        app.get('/myOrder', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = req.query.email;
            if (email === decodedEmail) {
                const query = { buyerEmail: email };
                const tool = await purchaseCollection.find(query).toArray();
                res.send(tool);
            }
            else {
                res.status(403).send({ message: 'forbidden access' })
            }
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
