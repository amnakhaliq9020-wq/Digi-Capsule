"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Delivery = { id: string; status: string; memoryTitle: string; occurrenceAt: string; sentAt: string | null; recipient: { displayName: string; email: string }; trigger: string | null };

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  useEffect(() => { api<{ deliveries: Delivery[] }>("/v1/deliveries").then((data) => setDeliveries(data.deliveries)).catch(() => undefined); }, []);
  return (
    <Shell>
      <h1>Scheduled deliveries</h1>
      <p className="muted">Each row is one recipient of one memory. A repeated worker run does not add another row.</p>
      <div className="list">
        {deliveries.length === 0 ? <p className="muted">No deliveries have been created yet. Future dates stay here as memories until they are due.</p> : null}
        {deliveries.map((delivery) => (
          <article key={delivery.id} className="item">
            <strong>{delivery.memoryTitle}</strong>
            <p className="muted">{delivery.recipient.displayName} ({delivery.recipient.email})</p>
            <p className="muted">{delivery.trigger} · {delivery.status} · {delivery.sentAt ? `sent ${new Date(delivery.sentAt).toLocaleString()}` : new Date(delivery.occurrenceAt).toLocaleString()}</p>
          </article>
        ))}
      </div>
    </Shell>
  );
}
