/**
 * AI Facilitator Service
 * Handles interactions with AI providers (currently mocked).
 * This service is designed to be swappable with real providers like OpenAI or Anthropic.
 */
class AIService {
  constructor() {
    // Environment variables for future configuration
    // AI_PROVIDER can be 'mock', 'openai', etc.
    this.apiKey = process.env.AI_PROVIDER_KEY;
    this.provider = process.env.AI_PROVIDER || 'mock'; 
  }

  // PUBLIC_INTERFACE
  /**
   * Generates a response based on a prompt and optional context.
   * @param {string} prompt - The user's input.
   * @param {Object} context - Contextual information (project, event, etc.).
   * @returns {Promise<{content: string, suggestedActions: string[]}>}
   */
  async generateResponse(prompt, context = {}) {
    console.log(`[AIService] Generating response for provider: ${this.provider}`);
    
    if (this.provider === 'mock') {
      return this._generateMockResponse(prompt, context);
    }

    // Placeholder for real API calls (e.g. OpenAI)
    // return this._callExternalProvider(prompt, context);
    
    // Fallback
    return this._generateMockResponse(prompt, context);
  }

  /**
   * Internal method to generate a deterministic mock response.
   * @param {string} prompt 
   * @param {Object} context 
   * @returns {Promise<Object>}
   */
  _generateMockResponse(prompt, context) {
    return new Promise((resolve) => {
      // Simulate network delay
      setTimeout(() => {
        const responses = [
          'That sounds like a solid plan. Have you considered potential risks?',
          'I can help facilitate that. Who are the key stakeholders needed?',
          'Based on previous project data, this aligns with standard timelines.',
          'I\'ve analyzed your request. Here are some next steps to consider.',
          'Could you provide more details so I can assist better?'
        ];

        // Deterministic selection based on prompt length to seem "stable" but varied
        const index = prompt.length % responses.length;
        let content = responses[index];

        // Incorporate context if available
        if (context.title) {
          const type = context.type ? context.type.charAt(0).toUpperCase() + context.type.slice(1) : 'Context';
          content = `[${type}: ${context.title}] ${content} I see you are working on this context.`;
        } else {
          content = `[AI Assistant] ${content}`;
        }

        resolve({
          content: content,
          suggestedActions: [
            'Create Follow-up Task',
            'Schedule Review Meeting',
            'Summarize Discussion'
          ]
        });
      }, 300);
    });
  }
}

module.exports = new AIService();
