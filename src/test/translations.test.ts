import { describe, it, expect } from 'vitest';
import { translations } from '@/i18n/translations';
import { Language } from '@/i18n/translations';

describe('i18n translations', () => {
  const languages: Language[] = ['en', 'zh'];
  
  it('should have translations for both languages', () => {
    expect(translations.en).toBeDefined();
    expect(translations.zh).toBeDefined();
  });

  it('should have the same keys in both languages', () => {
    const enKeys = Object.keys(translations.en).sort();
    const zhKeys = Object.keys(translations.zh).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('should have all required navigation keys', () => {
    const requiredKeys = [
      'dashboard', 'neural', 'trading', 'missions', 'terminal',
      'aria', 'quantum', 'satellite', 'hacker', 'agents',
      'city3d', 'analytics', 'emergency', 'weather', 'news',
      'settings', 'about', 'achievements'
    ];
    
    for (const key of requiredKeys) {
      expect(translations.en[key as keyof typeof translations.en]).toBeDefined();
      expect(translations.en[key as keyof typeof translations.en]).not.toBe('');
    }
  });

  it('should have dashboard translations', () => {
    expect(translations.en.cityOverview).toBe('CITY OVERVIEW');
    expect(translations.en.population).toBe('Population');
    expect(translations.en.energyGrid).toBe('Energy Grid');
  });

  it('should have Chinese translations for dashboard', () => {
    expect(translations.zh.cityOverview).toBe('城市概览');
    expect(translations.zh.population).toBe('人口');
    expect(translations.zh.energyGrid).toBe('电网');
  });

  languages.forEach((lang) => {
    describe(`${lang} translations`, () => {
      it('should not have empty string values', () => {
        const trans = translations[lang];
        for (const [key, value] of Object.entries(trans)) {
          if (typeof value === 'string') {
            expect(value).not.toBe('');
          }
        }
      });

      it('should have common keys', () => {
        expect(translations[lang].active).toBeDefined();
        expect(translations[lang].idle).toBeDefined();
        expect(translations[lang].warning).toBeDefined();
      });
    });
  });
});
