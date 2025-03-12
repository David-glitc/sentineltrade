import OpenAI from 'openai';
import { config } from '../config/config';
import { log, logError } from '../utils/logger';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createReadStream } from 'fs';

class VoiceService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.apis.openai.apiKey,
    });
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      log.debug('Starting audio transcription with OpenAI Whisper');
      
      // Create a temporary file
      const tempFilePath = join(tmpdir(), `audio-${Date.now()}.ogg`);
      await writeFile(tempFilePath, audioBuffer);

      // Create transcription
      const response = await this.openai.audio.transcriptions.create({
        file: createReadStream(tempFilePath),
        model: 'whisper-1',
        language: 'en',
      });

      // Clean up temporary file
      await writeFile(tempFilePath, '').catch(() => {});

      if (!response.text) {
        throw new Error('No transcription generated');
      }

      log.debug(`Transcription completed: ${response.text}`);
      return response.text;
    } catch (error) {
      logError(error as Error, 'VoiceService.transcribeAudio');
      throw error;
    }
  }

  async detectCommand(transcription: string): Promise<{
    command: string;
    params: Record<string, string>;
  }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a command parser for a cryptocurrency trading bot. Extract commands and parameters from user messages.
Available commands:
- price (params: symbol)
- alert (params: symbol, price)
- portfolio (no params)
- topGainers (no params)
- analysis (params: symbol)

Return ONLY a JSON object with "command" and "params" fields. No other text.`
          },
          {
            role: 'user',
            content: transcription
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (!result.command) {
        throw new Error('No command pattern matched');
      }

      return {
        command: result.command,
        params: result.params || {}
      };
    } catch (error) {
      logError(error as Error, 'VoiceService.detectCommand');
      throw error;
    }
  }

  // Helper method to normalize cryptocurrency symbols
  private normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase();
  }
}

export const voiceService = new VoiceService(); 