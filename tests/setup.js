// Mock chrome API for testing
global.chrome = {
  runtime: {
    sendMessage: jest.fn((msg, callback) => { if (callback) callback({}); }),
    onMessage: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    },
    openOptionsPage: jest.fn(),
    lastError: null
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    onRemoved: {
      addListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn()
    }
  },
  action: {
    onClicked: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn()
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  commands: {
    onCommand: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue()
    }
  },
  downloads: {
    download: jest.fn().mockImplementation((options, callback) => {
      if (callback) callback(1);
    })
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

// Helper to flush pending promises (replaces fragile setTimeout-based flushing)
global.flushPromises = () => new Promise(resolve => process.nextTick(resolve));

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
