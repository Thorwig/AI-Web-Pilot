import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import {
  Configuration,
  ConfigurationSchema,
  SENSITIVE_FIELD_PATTERNS,
} from "@/shared/types.js";

/**
 * Configuration management for Browser Pilot MCP
 */
export class ConfigManager {
  private configPath: string;
  private config: Configuration | null = null;

  constructor(configPath: string = "./config.json") {
    this.configPath = configPath;
  }

  /**
   * Load configuration from file or create default
   */
  async loadConfiguration(): Promise<Configuration> {
    try {
      if (existsSync(this.configPath)) {
        const configData = await readFile(this.configPath, "utf-8");
        const parsedConfig = JSON.parse(configData);
        this.config = ConfigurationSchema.parse(parsedConfig);
        console.log(`Configuration loaded from ${this.configPath}`);
      } else {
        this.config = this.getDefaultConfiguration();
        try {
          await this.saveConfiguration();
          console.log(`Default configuration created at ${this.configPath}`);
        } catch (saveError: unknown) {
          console.warn(
            `Could not save default configuration to ${this.configPath}:`,
            saveError instanceof Error ? saveError.message : String(saveError)
          );
          console.log("Using in-memory configuration only");
        }
      }

      return this.config;
    } catch (error: unknown) {
      console.error("Failed to load configuration:", error);
      console.log("Using default configuration");
      this.config = this.getDefaultConfiguration();
      return this.config;
    }
  }

  /**
   * Save current configuration to file
   */
  async saveConfiguration(): Promise<void> {
    if (!this.config) {
      throw new Error("No configuration to save");
    }

    try {
      // Ensure directory exists
      const configDir = dirname(this.configPath);
      if (!existsSync(configDir)) {
        await mkdir(configDir, { recursive: true });
      }

      const configData = JSON.stringify(this.config, null, 2);
      await writeFile(this.configPath, configData, "utf-8");
      console.log(`Configuration saved to ${this.configPath}`);
    } catch (error: unknown) {
      console.warn(
        `Failed to save configuration to ${this.configPath}:`,
        error instanceof Error ? error.message : String(error)
      );
      console.log("Configuration changes will only persist in memory");
      // Don't throw the error, just warn - allow the application to continue
    }
  }

  /**
   * Update configuration and save
   */
  async updateConfiguration(
    updates: Partial<Configuration>
  ): Promise<Configuration> {
    if (!this.config) {
      await this.loadConfiguration();
    }

    this.config = { ...this.config!, ...updates };

    // Validate updated configuration
    this.config = ConfigurationSchema.parse(this.config);

    await this.saveConfiguration();
    return this.config;
  }

  /**
   * Add domain to allowlist
   */
  async addDomainToAllowlist(
    domain: string,
    policy: {
      read: boolean;
      write: boolean;
      requiresApproval?: boolean;
      maxStepsPerHour?: number;
    }
  ): Promise<void> {
    if (!this.config) {
      await this.loadConfiguration();
    }

    this.config!.allowlist[domain] = policy;
    await this.saveConfiguration();
  }

  /**
   * Remove domain from allowlist
   */
  async removeDomainFromAllowlist(domain: string): Promise<void> {
    if (!this.config) {
      await this.loadConfiguration();
    }

    delete this.config!.allowlist[domain];
    await this.saveConfiguration();
  }

  /**
   * Get current configuration
   */
  getConfiguration(): Configuration | null {
    return this.config;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfiguration(): Configuration {
    return {
      allowlist: {
        // Local development
        localhost: { read: true, write: true },
        "127.0.0.1": { read: true, write: true },
        "*.localhost": { read: true, write: true },

        // Common safe domains for reading
        "github.com": { read: true, write: false },
        "stackoverflow.com": { read: true, write: false },
        "developer.mozilla.org": { read: true, write: false },
        "docs.python.org": { read: true, write: false },
        "nodejs.org": { read: true, write: false },

        // Example domains with restricted access
        "example.com": { read: true, write: false },
        "httpbin.org": { read: true, write: true }, // Testing service

        // Sensitive domains requiring approval
        "*.bank": { read: true, write: false, requiresApproval: true },
        "*.banking": { read: true, write: false, requiresApproval: true },
        "paypal.com": { read: true, write: false, requiresApproval: true },
        "stripe.com": { read: true, write: false, requiresApproval: true },
      },
      sensitivePatterns: SENSITIVE_FIELD_PATTERNS,
      stepBudget: 100,
      toolTimeoutMs: 30000,
      screenshotDir: "./screenshots",
      downloadDir: "./downloads",
      logging: {
        level: "info",
        maxLogSize: 10485760, // 10MB
        retentionDays: 7,
      },
    };
  }

  /**
   * Validate configuration file format
   */
  static async validateConfigurationFile(configPath: string): Promise<boolean> {
    try {
      if (!existsSync(configPath)) {
        return false;
      }

      const configData = await readFile(configPath, "utf-8");
      const parsedConfig = JSON.parse(configData);
      ConfigurationSchema.parse(parsedConfig);
      return true;
    } catch (error) {
      console.error("Configuration validation failed:", error);
      return false;
    }
  }

  /**
   * Create example configuration file
   */
  static async createExampleConfig(outputPath: string): Promise<void> {
    const manager = new ConfigManager();
    const defaultConfig = manager.getDefaultConfiguration();

    const configData = JSON.stringify(defaultConfig, null, 2);
    await writeFile(outputPath, configData, "utf-8");
    console.log(`Example configuration created at ${outputPath}`);
  }
}
