// Mock chrome API for testing
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  },
  action: {
    onClicked: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn()
  }
};

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue()
  }
});

// Add TextEncoder/TextDecoder for JSDOM compatibility
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Add custom matchers if needed
expect.extend({
  toBeValidMarkdown(received) {
    const pass = typeof received === 'string' && received.length > 0;
    return {
      message: () => `expected ${received} to be valid markdown`,
      pass
    };
  }
}); 