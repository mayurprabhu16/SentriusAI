require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const Chat = require('./Chat');

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
let isConnected = false;
async function connectToDatabase() {
    if (isConnected) return;
    try {
        const db = await mongoose.connect(process.env.MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        isConnected = db.connections[0].readyState;
        console.log(">> DB_CONNECTED");
    } catch (err) {
        console.error(">> DB_CONNECTION_FAILED:", err.message);
    }
}

// --- AUTH MIDDLEWARE ---
const requireUser = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized Identity' });
    req.userId = userId;
    next();
};

// --- AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Keeping your requested model. Note: Ensure 'gemini-2.5-flash' is the correct model name for your access level.
// standard models are currently 'gemini-1.5-flash' or 'gemini-1.5-pro'.
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const SYSTEM_PROMPT = `You are SentriusAI, a friendly and expert AI assistant exclusively focused on cybersecurity.`;

// --- HELPER: RETRY LOGIC FOR 503 ERRORS ---
async function sendMessageWithRetry(chatSession, message, maxRetries = 3, initialDelay = 2000) {
    let retries = maxRetries;
    let delay = initialDelay;

    while (true) {
        try {
            return await chatSession.sendMessage(message);
        } catch (err) {
            const isOverloaded = err.message.includes('503') || err.message.toLowerCase().includes('overloaded');
            if (isOverloaded && retries > 0) {
                console.log(`>> [WARN] MODEL_OVERLOAD (503). Retrying in ${delay}ms... (${retries} attempts remaining)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries--;
                delay *= 2; // Exponential backoff (wait longer each time)
            } else {
                throw err; // Not a 503, or out of retries -> fail for real
            }
        }
    }
}

// --- CHAT ENDPOINTS ---
app.get('/api/chats', requireUser, async (req, res) => {
    try {
        await connectToDatabase();
        if (mongoose.connection.readyState !== 1) throw new Error("Database not ready");
        const chats = await Chat.find({ userId: req.userId }, 'title lastUpdated').sort({ lastUpdated: -1 }).limit(20);
        res.json(chats);
    } catch (err) {
        console.error("ERROR IN /api/chats:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/chats/:id', requireUser, async (req, res) => {
    try {
        await connectToDatabase();
        const chat = await Chat.findOne({ _id: req.params.id, userId: req.userId });
        if (!chat) return res.status(404).json({ error: 'Operation not found' });
        res.json(chat);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chats', requireUser, async (req, res) => {
    try {
        await connectToDatabase();
        const newChat = new Chat({ userId: req.userId, title: `Operation_${Math.floor(1000 + Math.random() * 9000)}` });
        await newChat.save();
        res.json(newChat);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/chats/:id', requireUser, async (req, res) => {
    try {
        await connectToDatabase();
        const { title } = req.body;
        if (!title || title.trim().length === 0) return res.status(400).json({ error: 'Invalid title' });
        const chat = await Chat.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, { $set: { title: title.trim().substring(0, 50) } }, { new: true });
        if (!chat) return res.status(404).json({ error: 'Operation not found' });
        res.json(chat);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/chats/:id', requireUser, async (req, res) => {
    try {
        await connectToDatabase();
        const result = await Chat.deleteOne({ _id: req.params.id, userId: req.userId });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Operation not found' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chats/:id/message', requireUser, async (req, res) => {
    try {
        await connectToDatabase();
        const { message } = req.body;
        const chat = await Chat.findOne({ _id: req.params.id, userId: req.userId });
        if (!chat) return res.status(404).json({ error: 'Session inactive' });

        chat.messages.push({ role: 'user', content: message });
        await chat.save();

        const history = [
            { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
            { role: "model", parts: [{ text: "SYSTEM_READY" }] },
            ...chat.messages.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] }))
        ];

        // Use the new retry helper here
        const chatSession = model.startChat({ history });
        const result = await sendMessageWithRetry(chatSession, message);
        const text = await result.response.text();

        chat.messages.push({ role: 'model', content: text });
        chat.lastUpdated = Date.now();
        if (chat.messages.length === 4 && chat.title.startsWith('Operation_')) {
             chat.title = message.length > 30 ? message.substring(0, 30) + "..." : message;
        }
        await chat.save();
        res.json({ text });
    } catch (err) {
        console.error("API Error:", err);
        // More specific error message for the frontend if it still fails after retries
        const errorMessage = err.message.includes('503') ? "Neural net overloaded (503). Please retry manually." : "Processing failed";
        res.status(500).json({ error: errorMessage });
    }
});

// --- REAL NEWS API INTEGRATION ---
app.get('/api/news', async (req, res) => {
    try {
        const API_KEY = process.env.NEWS_API_KEY;
        if (!API_KEY) throw new Error("API Key Missing");

        const breachQuery = 'cybersecurity AND (ransomware OR "data breach" OR hacked OR exploit)';
        const breachRes = await axios.get(`https://newsapi.org/v2/everything?q=${encodeURIComponent(breachQuery)}&sortBy=publishedAt&language=en&pageSize=6&apiKey=${API_KEY}`);

        const trendQuery = 'cybersecurity AND (trend OR "future of" OR AI OR "quantum computing")';
        const trendRes = await axios.get(`https://newsapi.org/v2/everything?q=${encodeURIComponent(trendQuery)}&sortBy=relevancy&language=en&pageSize=6&apiKey=${API_KEY}`);

        const formatArticle = (article) => ({
            title: article.title || "Unknown Operation",
            summary: article.description || "Intel unavailable for this item.",
            content: article.content || "",
            url: article.url,
            source: article.source?.name || "CLASSIFIED SOURCE",
            author: article.author || "UNKNOWN_AGENT",
            image: article.urlToImage || "https://placehold.co/600x400/050505/003b00?text=CLASSIFIED",
            date: new Date(article.publishedAt).toLocaleDateString()
        });

        res.json({
            breaches: breachRes.data.articles.map(formatArticle),
            trends: trendRes.data.articles.map(formatArticle)
        });

    } catch (error) {
        console.error("News API Error:", error.message);
        const mockFallback = (title, summary) => ({
            title, summary, 
            url: "#", source: "INTERNAL_LOGS", author: "SYSTEM",
            image: "https://placehold.co/600x400/050505/003b00?text=OFFLINE",
            date: new Date().toLocaleDateString()
        });
        res.json({
            breaches: [mockFallback("API CONNECTION FAILURE", "Could not reach global intel servers.")],
            trends: [mockFallback("Intel Feed Offline", "Please check server logs.")]
        });
    }
});

app.get('/api/debug', (req, res) => res.json({ status: "Secured Core Online" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`>> SENTRIUS_CORE ONLINE: PORT ${PORT}`));

module.exports = app;