const AUTH_TOKEN = process.env.DROPMAIL_AUTH_TOKEN;
const GQL = `https://dropmail.me/api/graphql/${AUTH_TOKEN}`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Dropmail HTTP error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const data = await gql(`
        mutation {
          introduceSession {
            id
            expiresAt
            addresses { address }
          }
        }
      `);
      const session = data.introduceSession;
      return res.json({
        id: session.id,
        expiresAt: session.expiresAt,
        address: session.addresses[0]?.address || null,
      });
    } catch (err) {
      console.error("email-session error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "GET") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      const data = await gql(`
        query($id: ID!) {
          session(id: $id) {
            id
            expiresAt
            addresses { address }
          }
        }
      `, { id });
      const session = data.session;
      if (!session) return res.status(404).json({ error: "session not found" });
      return res.json({
        id: session.id,
        expiresAt: session.expiresAt,
        address: session.addresses[0]?.address || null,
      });
    } catch (err) {
      console.error("email-session GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
