const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiController = require('./src/controllers/ai');

jest.mock('@google/generative-ai');

describe('AI Controller Fix Verification', () => {
  let mockGetGenerativeModel;
  let mockStartChat;
  let mockSendMessageStream;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    
    mockSendMessageStream = jest.fn().mockResolvedValue({
        stream: (async function* () {
            yield { text: () => 'chunk1' };
        })()
    });

    mockStartChat = jest.fn().mockReturnValue({
        sendMessageStream: mockSendMessageStream
    });

    mockGetGenerativeModel = jest.fn().mockReturnValue({
        startChat: mockStartChat
    });

    GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel
    }));
  });

  test('uses gemini-2.5-flash and v1beta', async () => {
    const req = {
        body: {
            messages: [{ role: 'user', content: 'Hello' }]
        }
    };

    const res = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false
    };

    await aiController.chat(req, res);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-flash' }),
        expect.objectContaining({ apiVersion: 'v1beta' })
    );
    
    expect(res.write).toHaveBeenCalledWith('chunk1');
  });

  test('handles 404 error cleanly', async () => {
    const error = new Error('404 Not Found');
    mockSendMessageStream.mockRejectedValue(error);

    const req = { body: { messages: [{ role: 'user', content: 'Hi' }] } };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
        setHeader: jest.fn()
    };

    await aiController.chat(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('unavailable')
    }));
  });
});
