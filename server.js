const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "METHRA Backend is running"
    });
});

app.listen(3000, () => {
    console.log("METHRA backend running on port 3000");
});