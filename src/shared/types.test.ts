import { describe, it, expect } from 'vitest';
import { 
  BridgeMessage, 
  BridgeResponse, 
  ToolResponse,
  Configuration,
  OpenTabSchema,
  NavigateSchema,
  ClickSchema,
  TypeTextSchema,
  WaitForSchema,
  EvalJsSchema,
  ScreenshotSchema,
  ConfigurationSchema,
  DomainPolicySchema,
  WEBSOCKET_PORT,
  DEFAULT_TIMEOUT_MS,
  SENSITIVE_FIELD_PATTERNS
} from './types';

describe('Shared Types', () => {
  describe('Interface Types', () => {
    it('should define BridgeMessage interface correctly', () => {
      const message: BridgeMessage = {
        id: 'test-id',
        cmd: 'test-command',
        payload: { test: 'data' },
        timestamp: Date.now()
      };
      
      expect(message.id).toBe('test-id');
      expect(message.cmd).toBe('test-command');
      expect(typeof message.timestamp).toBe('number');
    });

    it('should define BridgeResponse interface correctly', () => {
      const response: BridgeResponse = {
        replyTo: 'test-id',
        payload: { result: 'success' }
      };
      
      expect(response.replyTo).toBe('test-id');
      expect(response.payload.result).toBe('success');
    });

    it('should define ToolResponse interface correctly', () => {
      const response: ToolResponse = {
        success: true,
        data: { result: 'test' },
        metadata: {
          tabId: 123,
          url: 'https://example.com',
          timestamp: Date.now()
        }
      };
      
      expect(response.success).toBe(true);
      expect(response.data?.result).toBe('test');
      expect(response.metadata?.tabId).toBe(123);
    });

    it('should define Configuration interface correctly', () => {
      const config: Configuration = {
        allowlist: {
          'example.com': { read: true, write: false }
        },
        sensitivePatterns: ['password', 'token'],
        stepBudget: 100,
        toolTimeoutMs: 5000,
        screenshotDir: '/screenshots',
        downloadDir: '/downloads',
        logging: {
          level: 'info',
          maxLogSize: 1000000,
          retentionDays: 7
        }
      };
      
      expect(config.stepBudget).toBe(100);
      expect(config.allowlist['example.com'].read).toBe(true);
      expect(config.logging.level).toBe('info');
    });
  });

  describe('Zod Schemas - Navigation Tools', () => {
    it('should validate OpenTabSchema correctly', () => {
      const validInput = { url: 'https://example.com' };
      const invalidInput = { url: 'not-a-url' };
      
      expect(() => OpenTabSchema.parse(validInput)).not.toThrow();
      expect(() => OpenTabSchema.parse(invalidInput)).toThrow();
    });

    it('should validate NavigateSchema correctly', () => {
      const validInputs = [
        { url: 'https://example.com' },
        { url: 'https://example.com', tabId: 123 },
        { tabId: 123 },
        {}
      ];
      
      const invalidInputs = [
        { url: 'not-a-url' },
        { tabId: -1 },
        { tabId: 0 }
      ];
      
      validInputs.forEach(input => {
        expect(() => NavigateSchema.parse(input)).not.toThrow();
      });
      
      invalidInputs.forEach(input => {
        expect(() => NavigateSchema.parse(input)).toThrow();
      });
    });
  });

  describe('Zod Schemas - DOM Interaction Tools', () => {
    it('should validate ClickSchema correctly', () => {
      const validInputs = [
        { selector: '#button' },
        { selector: '.class-name', tabId: 123 }
      ];
      
      const invalidInputs = [
        { selector: '' },
        { selector: '#button', tabId: -1 },
        {}
      ];
      
      validInputs.forEach(input => {
        expect(() => ClickSchema.parse(input)).not.toThrow();
      });
      
      invalidInputs.forEach(input => {
        expect(() => ClickSchema.parse(input)).toThrow();
      });
    });

    it('should validate TypeTextSchema correctly', () => {
      const validInputs = [
        { selector: '#input', text: 'hello' },
        { selector: '#input', text: 'hello', submit: true, tabId: 123 }
      ];
      
      const invalidInputs = [
        { selector: '', text: 'hello' },
        { selector: '#input' }, // missing text
        { selector: '#input', text: 'hello', tabId: -1 }
      ];
      
      validInputs.forEach(input => {
        expect(() => TypeTextSchema.parse(input)).not.toThrow();
      });
      
      invalidInputs.forEach(input => {
        expect(() => TypeTextSchema.parse(input)).toThrow();
      });
    });

    it('should validate WaitForSchema correctly', () => {
      const validInputs = [
        { selector: '#element' },
        { selector: '#element', timeout_ms: 10000 },
        { selector: '#element', timeout_ms: 10000, tabId: 123 }
      ];
      
      const invalidInputs = [
        { selector: '' },
        { selector: '#element', timeout_ms: -1 },
        { selector: '#element', timeout_ms: 0 }
      ];
      
      validInputs.forEach(input => {
        expect(() => WaitForSchema.parse(input)).not.toThrow();
      });
      
      invalidInputs.forEach(input => {
        expect(() => WaitForSchema.parse(input)).toThrow();
      });
    });

    it('should validate EvalJsSchema correctly', () => {
      const validInputs = [
        { code: 'document.title' },
        { code: 'console.log("test")', tabId: 123 }
      ];
      
      const invalidInputs = [
        { code: '' },
        { code: 'document.title', tabId: -1 },
        {}
      ];
      
      validInputs.forEach(input => {
        expect(() => EvalJsSchema.parse(input)).not.toThrow();
      });
      
      invalidInputs.forEach(input => {
        expect(() => EvalJsSchema.parse(input)).toThrow();
      });
    });
  });

  describe('Zod Schemas - Utility Tools', () => {
    it('should validate ScreenshotSchema correctly', () => {
      const validInputs = [
        {},
        { tabId: 123 },
        { filename: 'screenshot.png' },
        { tabId: 123, filename: 'screenshot.png' }
      ];
      
      const invalidInputs = [
        { tabId: -1 },
        { tabId: 0 }
      ];
      
      validInputs.forEach(input => {
        expect(() => ScreenshotSchema.parse(input)).not.toThrow();
      });
      
      invalidInputs.forEach(input => {
        expect(() => ScreenshotSchema.parse(input)).toThrow();
      });
    });
  });

  describe('Configuration Schemas', () => {
    it('should validate DomainPolicySchema correctly', () => {
      const validPolicies = [
        { read: true, write: false },
        { read: true, write: true, requiresApproval: true },
        { read: false, write: false, maxStepsPerHour: 100 }
      ];
      
      const invalidPolicies = [
        { read: true }, // missing write
        { write: false }, // missing read
        { read: true, write: false, maxStepsPerHour: -1 }
      ];
      
      validPolicies.forEach(policy => {
        expect(() => DomainPolicySchema.parse(policy)).not.toThrow();
      });
      
      invalidPolicies.forEach(policy => {
        expect(() => DomainPolicySchema.parse(policy)).toThrow();
      });
    });

    it('should validate ConfigurationSchema correctly', () => {
      const validConfig = {
        allowlist: {
          'example.com': { read: true, write: false }
        },
        sensitivePatterns: ['password', 'token'],
        stepBudget: 100,
        toolTimeoutMs: 5000,
        screenshotDir: '/screenshots',
        downloadDir: '/downloads',
        logging: {
          level: 'info' as const,
          maxLogSize: 1000000,
          retentionDays: 7
        }
      };
      
      const invalidConfigs = [
        { ...validConfig, stepBudget: -1 },
        { ...validConfig, toolTimeoutMs: 0 },
        { ...validConfig, screenshotDir: '' },
        { ...validConfig, logging: { ...validConfig.logging, level: 'invalid' } }
      ];
      
      expect(() => ConfigurationSchema.parse(validConfig)).not.toThrow();
      
      invalidConfigs.forEach(config => {
        expect(() => ConfigurationSchema.parse(config)).toThrow();
      });
    });
  });

  describe('Constants', () => {
    it('should define correct constant values', () => {
      expect(WEBSOCKET_PORT).toBe(8777);
      expect(DEFAULT_TIMEOUT_MS).toBe(5000);
      expect(Array.isArray(SENSITIVE_FIELD_PATTERNS)).toBe(true);
      expect(SENSITIVE_FIELD_PATTERNS).toContain('password');
      expect(SENSITIVE_FIELD_PATTERNS).toContain('token');
    });
  });
});