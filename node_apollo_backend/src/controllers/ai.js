const { GoogleGenerativeAI } = require('@google/generative-ai');

// PUBLIC_INTERFACE
exports.chat = async (req, res) => {
  console.log('AI Controller: Received chat request');
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('AI Controller: GEMINI_API_KEY is missing in environment variables');
      return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    } else {
      console.log('AI Controller: API Key present (masked):', apiKey.substring(0, 4) + '...');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as requested, specifying v1beta API version explicitly if needed by the SDK
    // for newer models, though the SDK usually defaults to a compatible version.
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash' 
    }, { 
      apiVersion: 'v1beta' 
    });

    const { messages, context } = req.body;

    if (!messages || !Array.isArray(messages)) {
       return res.status(400).json({ error: 'Invalid request: "messages" array is required' });
    }

    // Default system instruction
    let systemInstruction = 'You are a professional, witty AI facilitator for a project collaboration platform. Keep responses concise and helpful.';
    
    // Append context if available
    if (context) {
      systemInstruction += `\n\nContext:\n${JSON.stringify(context, null, 2)}`;
    }

    // Transform messages for Gemini
    // Expecting: [{ role: 'user'|'assistant'|'model', content: '...' }]
    const history = (messages || []).map(m => {
      // Standardize roles: 'assistant' -> 'model'
      const role = (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user';
      return {
        role: role,
        parts: [{ text: m.content }]
      };
    });

    // Extract last message as the new prompt
    // Gemini expects the history to NOT include the current prompt
    const lastMessage = history.length > 0 ? history.pop() : { parts: [{ text: 'Hello' }] };

    console.log(`AI Controller: Starting chat with ${history.length} history items`);

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
    console.log('AI Controller: Response stream completed');

  } catch (error) {
    console.error('AI Chat Error:', error);
    if (!res.headersSent) {
        let statusCode = 500;
        let msg = error.message || 'Internal AI Error';

        // Check for specific Google AI error patterns
        if (error.message && error.message.includes('404')) {
          statusCode = 404;
          msg = 'The requested AI model is currently unavailable or deprecated. Please contact support.';
        } else if (error.status) {
          statusCode = error.status;
        }

        res.status(statusCode).json({ error: msg });
    } else {
        // Stream already started, can't send JSON
        res.write(`\n[Error: ${error.message}]`);
        res.end();
    }
  }
};
