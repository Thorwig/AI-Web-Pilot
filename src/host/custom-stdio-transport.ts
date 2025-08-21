import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Readable, Writable } from "stream";

/**
 * Custom stdio transport that handles cases where process.stdin/stdout might be undefined
 */
export class CustomStdioTransport implements Transport {
  private stdin: Readable;
  private stdout: Writable;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor() {
    // Create fallback streams if process streams are not available
    this.stdin =
      process.stdin ||
      new Readable({
        read() {
          // No-op readable stream
        },
      });

    this.stdout =
      process.stdout ||
      new Writable({
        write(chunk, encoding, callback) {
          // Fallback to stderr if stdout is not available
          if (process.stderr) {
            process.stderr.write(chunk, encoding);
          }
          callback();
        },
      });
  }

  async start(): Promise<void> {
    console.error("Starting custom stdio transport...");

    // Set up stdin listener
    if (this.stdin && typeof this.stdin.on === "function") {
      this.stdin.on("data", (data: Buffer) => {
        try {
          const lines = data.toString().trim().split("\n");
          for (const line of lines) {
            if (line.trim()) {
              const message = JSON.parse(line);
              console.error(`Received message: ${JSON.stringify(message)}`);
              this.onmessage?.(message);
            }
          }
        } catch (error) {
          console.error("Error parsing stdin data:", error);
          this.onerror?.(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      this.stdin.on("end", () => {
        console.error("stdin ended");
        this.onclose?.();
      });

      this.stdin.on("error", (error: Error) => {
        console.error("stdin error:", error);
        this.onerror?.(error);
      });
    } else {
      console.error("stdin not available or doesn't support events");
    }

    console.error("Custom stdio transport started");
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const messageStr = JSON.stringify(message) + "\n";

    if (this.stdout && typeof this.stdout.write === "function") {
      this.stdout.write(messageStr);
    } else {
      console.error("stdout not available, message:", messageStr);
    }
  }

  async close(): Promise<void> {
    console.error("Closing custom stdio transport");
    this.onclose?.();
  }
}
