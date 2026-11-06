import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();

afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app);
});

describe("contacts", () => {
  it("requires a name, email, and phone, then lists, edits, and removes the contact", async () => {
    const author = await registerUser(app, "contacts@example.test");
    await verifyEmail(app, author.cookie, author.token);

    const missing = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: { cookie: author.cookie },
      payload: { displayName: "Amina", email: "amina@example.test" },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.details.fieldErrors.phone[0]).toBe("Enter a phone number.");

    const created = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: { cookie: author.cookie },
      payload: {
        displayName: "Amina",
        email: "amina@example.test",
        phone: "+92 300 555 0101",
        roles: ["recipient"],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().contact.phone).toBe("+92 300 555 0101");

    const listed = await app.inject({
      method: "GET",
      url: "/v1/contacts",
      headers: { cookie: author.cookie },
    });
    expect(listed.json().contacts).toHaveLength(1);

    const id = created.json().contact.id as string;
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/contacts/${id}`,
      headers: { cookie: author.cookie },
      payload: { phone: "03005550101" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().contact.phone).toBe("03005550101");

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/contacts/${id}`,
      headers: { cookie: author.cookie },
    });
    expect(removed.statusCode).toBe(204);
    const empty = await app.inject({
      method: "GET",
      url: "/v1/contacts",
      headers: { cookie: author.cookie },
    });
    expect(empty.json().contacts).toHaveLength(0);
  });
});
