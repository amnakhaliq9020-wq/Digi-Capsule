import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fromZod, isUniqueViolation } from "../errors";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254, "Email is too long."),
});

export async function waitlistRoutes(app: FastifyInstance) {
  app.post("/waitlist", { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } }, async (request) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const email = parsed.data.email.toLowerCase();
    try {
      await app.prisma.waitlistEntry.create({ data: { email } });
      return { status: "joined" };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return { status: "already_joined" };
    }
  });
}
