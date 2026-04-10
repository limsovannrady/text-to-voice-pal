const AUTH_TOKEN = process.env.DROPMAIL_AUTH_TOKEN;
const GQL = `https://dropmail.me/api/graphql/${AUTH_TOKEN}`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Dropmail HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

async function createSession() {
  const data = await gql(`
    mutation {
      introduceSession {
        id
        expiresAt
        addresses { address }
      }
    }
  `);
  const s = data.introduceSession;
  return {
    id: s.id,
    expiresAt: s.expiresAt,
    address: s.addresses[0]?.address || null,
  };
}

export default async function handler(req, res) {
  // POST or GET without id → create new session
  if (req.method === "POST" || (req.method === "GET" && !req.query.id)) {
    try {
      const session = await createSession();
      return res.json(session);
    } catch (err) {
      console.error("email-session create error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // GET with id → fetch existing session info
  if (req.method === "GET" && req.query.id) {
    try {
      const data = await gql(`
        query($id: ID!) {
          session(id: $id) {
            id
            expiresAt
            addresses { address }
          }
        }
      `, { id: req.query.id });
      const s = data.session;
      if (!s) return res.status(404).json({ error: "session not found" });
      return res.json({
        id: s.id,
        expiresAt: s.expiresAt,
        address: s.addresses[0]?.address || null,
      });
    } catch (err) {
      console.error("email-session GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
