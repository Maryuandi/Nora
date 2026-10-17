import { Client, Connection } from "@temporalio/client";

let client: Promise<Client> | undefined;

export function getTemporalClient(): Promise<Client> {
  client ??= Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" })
    .then((connection) => new Client({ connection }))
    .catch((err) => {
      client = undefined; // allow retry once Temporal comes up
      throw err;
    });
  return client;
}
