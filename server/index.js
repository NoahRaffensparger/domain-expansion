const express = require('express');
const { Pool } = require('pg');
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const { getJson } = require("serpapi");
require("dotenv").config();

const PORT = process.env.PORT || 3001;
const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

async function getAvailableTrendingDomains() {
  const trending = await fetchTrendingSearches();
  const domainsToCheck = trending.map(q => `${q.replace(/\s+/g, "")}.com`);
  const availability = await checkDomainsTest(domainsToCheck);

  const combined = trending.map((query, i) => {
    const domainInfo = availability?.results?.[i] || {};
    return {
      query,
      domain: domainsToCheck[i],
      available: domainInfo.purchasable ?? false,
      purchasePrice: domainInfo.purchasePrice ?? null,
      renewalPrice: domainInfo.renewalPrice ?? null
    };
  });

  return combined.filter(d => d.available);
}



async function fetchTrendingSearches() {
  return new Promise((resolve, reject) => {
    getJson(
      {
        engine: "google_trends_trending_now",
        geo: "US",
        api_key: process.env.SERPAPI_TOKEN,
      },
      (json) => {
        if (json && json.trending_searches) {
          const queries = json.trending_searches
            .slice(0, 50)
            .map(item => item.query);
          resolve(queries);
        } else {
          reject("No trending searches found");
        }
      }
    );
  });
}

async function checkDomainsTest(domains) {
  const username = process.env.NAME_SANDBOX_USERNAME;
  const token = process.env.NAME_SANDBOX_API_TOKEN;
  const base64Creds = Buffer.from(`${username}:${token}`).toString("base64");

  try {
    const response = await axios.post(
      "https://api.dev.name.com/core/v1/domains:checkAvailability",
      { domainNames: domains },
      { headers: { Authorization: `Basic ${base64Creds}`, "Content-Type": "application/json" } }
    );
    return response.data;
  } catch (err) {
    console.error("Domain API Error:", err.response?.data || err.message);
    return null;
  }
}

async function checkDomains(domains) {
  const username = process.env.NAME_USERNAME;
  const token = process.env.NAME_API_TOKEN;
  const base64Creds = Buffer.from(`${username}:${token}`).toString("base64");

  try {
    const response = await axios.post(
      "https://api.name.com/core/v1/domains:checkAvailability",
      { domainNames: domains },
      { headers: { Authorization: `Basic ${base64Creds}`, "Content-Type": "application/json" } }
    );
    return response.data;
  } catch (err) {
    console.error("Domain API Error:", err.response?.data || err.message);
    return null;
  }
}

app.get("/trending/domains-test", async (req, res) => {
  try {
    const trending = await fetchTrendingSearches();
    const domainsToCheck = trending.map(q => `${q.replace(/\s+/g, "")}.com`);
    const availability = await checkDomainsTest(domainsToCheck);

    const combined = trending.map((query, i) => {
      const domainInfo = availability?.results?.[i] || {};
      return {
        query,
        domain: domainsToCheck[i],
        available: domainInfo.purchasable ?? false,
        purchasePrice: domainInfo.purchasePrice ?? null,
        renewalPrice: domainInfo.renewalPrice ?? null
      };
    });
    const availableDomains = combined.filter(d => d.available);

    res.json(availableDomains);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch trending searches or domain availability" });
  }
});

app.get("/trending/domains", async (req, res) => {
  try {
    const trending = await fetchTrendingSearches();
    const domainsToCheck = trending.map(q => `${q.replace(/\s+/g, "")}.com`);
    const availability = await checkDomains(domainsToCheck);

    const combined = trending.map((query, i) => {
      const domainInfo = availability?.results?.[i] || {};
      return {
        query,
        domain: domainsToCheck[i],
        available: domainInfo.purchasable ?? false,
        purchasePrice: domainInfo.purchasePrice ?? null,
        renewalPrice: domainInfo.renewalPrice ?? null
      };
    });

    const availableDomains = combined.filter(d => d.available);

    res.json(availableDomains);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch trending searches or domain availability" });
  }
});

cron.schedule("0 6 * * *", async () => {
  const domains = await getAvailableTrendingDomains();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: "Here are todays available, trending domains",
    text: domains,
  });
});

async function function1() {
  const domains = await getAvailableTrendingDomains();

  const emailBody = domains
    .map(d => `Query: ${d.query}\nDomain: ${d.domain}\nPrice: $${d.purchasePrice ?? "N/A"}\nRenewal: $${d.renewalPrice ?? "N/A"}\n`)
    .join("\n----------------------\n");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: "Here are todays available, trending domains",
    text: emailBody,
  });
};

function1()
// name.com api

app.post("/nameapi/check-availability", async (req, res) => {
  try {
    const { domains } = req.body;
    const username = process.env.NAME_SANDBOX_USERNAME;
    const token = process.env.NAME_SANDBOX_API_TOKEN;
    const base64Creds = Buffer.from(`${username}:${token}`).toString("base64");

    const response = await axios.post(
      "https://api.dev.name.com/core/v1/domains:checkAvailability",
      {
        domainNames: domains,
      },
      {
        headers: {
          Authorization: `Basic ${base64Creds}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json(response.data);

  } catch (error) {
    console.error("API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to check domain availability" });
  }
});

// serpapi

app.get("/serpapi/trending", async (req, res) => {
  try {
    const trendingSearches = await new Promise((resolve, reject) => {
      getJson(
        {
          engine: "google_trends_trending_now",
          geo: "US",
          api_key: process.env.SERPAPI_TOKEN,
        },
        (json) => {
          if (json && json.trending_searches) {
            const queries = json.trending_searches.map(item => item.query);
            resolve(queries);
          } else {
            reject("No trending searches found");
          }
        }
      );
    });

    res.json(trendingSearches)
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch trending searches" });
  }
});

app.post("/submit", async (req, res) => {
  const { name, email, message, phone_number } = req.body;

  try {
    await pool.query(
      "INSERT INTO form_submissions (name, email, message, phone_number) VALUES ($1, $2, $3, $4)",
      [name, email, message, phone_number]
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO,
      subject: "New Form Submission on noahraffensparger.com",
      text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}\nPhone Number: ${phone_number}`,
    });

    res.status(200).json({ success: true, message: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.use((req, res) => {
  res.status(404).end();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
});
