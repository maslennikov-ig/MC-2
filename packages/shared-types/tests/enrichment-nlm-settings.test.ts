import { describe, expect, it } from 'vitest';
import { generateOnDemandInputSchema } from '../src/enrichment-on-demand';
import {
  enrichmentSettingsSchema,
  getDefaultSettings,
  nlmAudioSettingsSchema,
  nlmVideoSettingsSchema,
} from '../src/enrichment-settings';

describe('NLM enrichment settings schemas', () => {
  it('parses on-demand nlm_audio settings with source strategy and presets', () => {
    const parsed = generateOnDemandInputSchema.parse({
      lessonId: 'd6dd8a79-939d-4f89-bf5d-9bb519f9d608',
      enrichmentType: 'nlm_audio',
      settings: {
        nlm_source_strategy: 'hybrid',
        nlm_audio_format: 'deep_dive',
        nlm_audio_length: 'default',
      },
    });

    expect(parsed.settings).toMatchObject({
      nlm_source_strategy: 'hybrid',
      nlm_audio_format: 'deep_dive',
      nlm_audio_length: 'default',
    });
  });

  it('parses on-demand nlm_video settings with source strategy and presets', () => {
    const parsed = generateOnDemandInputSchema.parse({
      lessonId: '1b79942a-2fca-4545-a973-ea82a85cb9b6',
      enrichmentType: 'nlm_video',
      settings: {
        nlm_source_strategy: 'raw_only',
        nlm_video_format: 'brief',
        nlm_video_style: 'classic',
        tone: 'conversational',
        pacing: 'moderate',
      },
    });

    expect(parsed.settings).toMatchObject({
      nlm_source_strategy: 'raw_only',
      nlm_video_format: 'brief',
      nlm_video_style: 'classic',
      tone: 'conversational',
      pacing: 'moderate',
    });
  });

  it('validates typed enrichment settings for nlm_audio and nlm_video', () => {
    const audio = enrichmentSettingsSchema.parse({
      type: 'nlm_audio',
      settings: {
        nlm_source_strategy: 'script_only',
        nlm_audio_format: 'brief',
        nlm_audio_length: 'short',
      },
    });

    const video = enrichmentSettingsSchema.parse({
      type: 'nlm_video',
      settings: {
        nlm_source_strategy: 'hybrid',
        nlm_video_format: 'explainer',
        nlm_video_style: 'auto_select',
      },
    });

    expect(audio.settings).toMatchObject({
      nlm_source_strategy: 'script_only',
      nlm_audio_format: 'brief',
      nlm_audio_length: 'short',
    });

    expect(video.settings).toMatchObject({
      nlm_source_strategy: 'hybrid',
      nlm_video_format: 'explainer',
      nlm_video_style: 'auto_select',
    });
  });

  it('keeps default schemas backward-compatible for empty payloads', () => {
    expect(nlmAudioSettingsSchema.parse({})).toEqual({});
    expect(nlmVideoSettingsSchema.parse({})).toEqual({ include_slides: true });
    expect(getDefaultSettings('nlm_audio')).toEqual({});
    expect(getDefaultSettings('nlm_video')).toEqual({ include_slides: true });
  });
});
