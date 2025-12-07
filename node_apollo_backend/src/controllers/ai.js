const { GoogleGenerativeAI } = require('@google/generative-ai');

// PUBLIC_INTERFACE
exports.chat = async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Gemini API key is missing');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const { messages, context } = req.body;

    // Default system instruction
    let systemInstruction = 'You are a professional, witty AI facilitator for a project collaboration platform. Keep responses concise and helpful.';
    
    // Append context if available
    if (context) {
      systemInstruction += `\n\nContext:\n${JSON.stringify(context, null, 2)}`;
    }

    // Transform messages for Gemini
    // Expecting: [{ role: 'user'|'assistant'|'model', content: '...' }]
    const history = (messages || []).map(m => ({
      role: (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Extract last message as the new prompt
    const lastMessage = history.length > 0 ? history.pop() : { parts: [{ text: 'Hello' }] };

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemInstruction }]
        },
        {
          role: 'model',
          parts: [{ text: 'Understood. I am ready to facilitate.' }]
        },
        ...history
      ],
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    const result = await chat.sendMessageStream(lastMessage.parts[0].text);

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText);
    }

    res.end();

  } catch (error) {
    console.error('AI Chat Error:', error);
    if (!res.headersSent) {
        res.status(500).json({ error: error.message });
    } else {
        res.end();
    }
  }
};
