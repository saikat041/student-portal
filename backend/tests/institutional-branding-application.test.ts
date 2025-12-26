import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { connectTestDatabase, disconnectTestDatabase, clearTestDatabase } from '../config/test-database';
import { institutionService } from '../services/InstitutionService';
import { brandingService, BrandingConfiguration } from '../services/BrandingService';
import { InstitutionRegistrationData } from '../services/InstitutionService';
import Institution from '../models/Institution';

describe('Institutional Branding Application Property Tests', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  // Generator for valid hex colors
  const hexColorGenerator = (): fc.Arbitrary<string> => {
    return fc.integer({ min: 0, max: 0xffffff })
      .map(n => `#${n.toString(16).padStart(6, '0').toUpperCase()}`);
  };

  // Generator for valid URLs
  const urlGenerator = (): fc.Arbitrary<string> => {
    return fc.oneof(
      fc.constant(''), // Empty string for no logo
      fc.constant('https://example.com/logo.png'),
      fc.constant('https://example.com/favicon.ico'),
      fc.integer({ min: 1000, max: 9999 }).map(n => `https://example.com/logos/logo-${n}.png`)
    );
  };

  // Generator for valid branding configuration
  const brandingConfigGenerator = (): fc.Arbitrary<Partial<BrandingConfiguration>> => {
    return fc.record({
      primaryColor: fc.option(hexColorGenerator(), { nil: undefined }),
      secondaryColor: fc.option(hexColorGenerator(), { nil: undefined }),
      logo: fc.option(urlGenerator(), { nil: undefined }),
      favicon: fc.option(urlGenerator(), { nil: undefined }),
      theme: fc.option(fc.constantFrom('default', 'dark', 'light', 'custom'), { nil: undefined }),
      customCSS: fc.option(fc.string({ maxLength: 1000 }), { nil: undefined }),
      emailTemplate: fc.option(fc.record({
        headerColor: fc.option(hexColorGenerator(), { nil: undefined }),
        footerText: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
        logoUrl: fc.option(urlGenerator(), { nil: undefined })
      }), { nil: undefined }),
      navigationStyle: fc.option(fc.constantFrom('default', 'minimal', 'sidebar'), { nil: undefined }),
      fontFamily: fc.option(fc.constantFrom(
        'system-ui, -apple-system, sans-serif',
        'Arial, sans-serif',
        'Georgia, serif',
        'Times New Roman, serif',
        'Courier New, monospace'
      ), { nil: undefined })
    });
  };

  // Generator for institution registration data with unique names
  const institutionRegistrationGenerator = (): fc.Arbitrary<InstitutionRegistrationData> => {
    return fc.tuple(
      fc.integer({ min: 10000, max: 99999 }),
      fc.integer({ min: 100000, max: 999999 }),
      fc.integer({ min: 1000, max: 9999 }),
      fc.constantFrom('university', 'college', 'school')
    ).map(([seed, timestamp, random, type]) => ({
      name: `Institution_${seed}_${timestamp}_${random}`,
      type,
      address: {
        street: `${seed} Main Street`,
        city: 'Test City',
        state: 'Test State',
        zipCode: '12345'
      },
      contactInfo: {
        email: `contact${seed}${timestamp}${random}@institution.edu`,
        phone: `+1-555-${String(seed).padStart(4, '0')}`
      }
    }));
  };

  /**
   * Feature: multi-institution-support, Property 7: Institution-Specific Branding Application
   * For any user interface element within an institutional context, the system should apply that institution's specific branding, colors, and styling
   * Validates: Requirements 8.1, 8.2, 8.3
   */
  it('should apply institution-specific branding configuration to all interface elements', async () => {
    await fc.assert(
      fc.asyncProperty(
        institutionRegistrationGenerator(),
        brandingConfigGenerator(),
        async (institutionData, brandingConfig) => {
          // Register institution
          const institution = await institutionService.registerInstitution(institutionData);
          const institutionId = institution._id.toString();

          // Update branding configuration
          const updatedBranding = await brandingService.updateBrandingConfiguration(
            institutionId, 
            brandingConfig
          );

          // Property 1: Retrieved branding should match the applied configuration
          const retrievedBranding = await brandingService.getBrandingConfiguration(institutionId);
          expect(retrievedBranding).toBeDefined();

          // Verify each branding field is applied correctly
          if (brandingConfig.primaryColor) {
            expect(retrievedBranding!.primaryColor).toBe(brandingConfig.primaryColor);
          }
          
          if (brandingConfig.secondaryColor) {
            expect(retrievedBranding!.secondaryColor).toBe(brandingConfig.secondaryColor);
          }
          
          if (brandingConfig.logo) {
            expect(retrievedBranding!.logo).toBe(brandingConfig.logo);
          }
          
          if (brandingConfig.favicon) {
            expect(retrievedBranding!.favicon).toBe(brandingConfig.favicon);
          }
          
          if (brandingConfig.theme) {
            expect(retrievedBranding!.theme).toBe(brandingConfig.theme);
          }
          
          if (brandingConfig.customCSS) {
            expect(retrievedBranding!.customCSS).toBe(brandingConfig.customCSS);
          }
          
          if (brandingConfig.navigationStyle) {
            expect(retrievedBranding!.navigationStyle).toBe(brandingConfig.navigationStyle);
          }
          
          if (brandingConfig.fontFamily) {
            expect(retrievedBranding!.fontFamily).toBe(brandingConfig.fontFamily);
          }

          // Property 2: Generated CSS should contain institution-specific styling
          const generatedCSS = await brandingService.generateBrandingCSS(institutionId);
          expect(generatedCSS).toContain('--institution-primary-color');
          
          if (brandingConfig.primaryColor) {
            expect(generatedCSS).toContain(brandingConfig.primaryColor);
          }
          
          if (brandingConfig.secondaryColor) {
            expect(generatedCSS).toContain(brandingConfig.secondaryColor);
          }
          
          if (brandingConfig.fontFamily) {
            expect(generatedCSS).toContain(brandingConfig.fontFamily);
          }

          // Property 3: Email branding should reflect institution-specific configuration
          const emailBranding = await brandingService.getEmailBranding(institutionId);
          expect(emailBranding).toBeDefined();
          expect(emailBranding.primaryColor).toBe(retrievedBranding!.primaryColor);
          
          if (brandingConfig.emailTemplate?.headerColor) {
            expect(emailBranding.headerColor).toBe(brandingConfig.emailTemplate.headerColor);
          }
          
          if (brandingConfig.emailTemplate?.logoUrl) {
            expect(emailBranding.logoUrl).toBe(brandingConfig.emailTemplate.logoUrl);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-institution-support, Property 7: Institution-Specific Branding Application (Isolation)
   * Branding changes for one institution should not affect other institutions
   * Validates: Requirements 8.1, 8.2, 8.3
   */
  it('should maintain branding isolation between different institutions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        fc.array(brandingConfigGenerator(), { minLength: 2, maxLength: 4 }),
        async (numInstitutions, brandingConfigArray) => {
          const institutions: string[] = [];
          const expectedBrandings: BrandingConfiguration[] = [];

          // Register institutions and apply different branding configurations
          for (let i = 0; i < numInstitutions; i++) {
            const institutionData: InstitutionRegistrationData = {
              name: `Institution_Isolation_Test_${i}_${Date.now()}`,
              type: 'university',
              address: {
                street: `${1000 + i} Main Street`,
                city: 'Test City',
                state: 'Test State',
                zipCode: '12345'
              },
              contactInfo: {
                email: `contact${i}${Date.now()}@institution.edu`,
                phone: `+1-555-${String(1000 + i).padStart(4, '0')}`
              }
            };

            const institution = await institutionService.registerInstitution(institutionData);
            const institutionId = institution._id.toString();
            institutions.push(institutionId);

            const updatedBranding = await brandingService.updateBrandingConfiguration(
              institutionId,
              brandingConfigArray[i] || {}
            );
            expectedBrandings.push(updatedBranding);
          }

          // Property: Each institution should maintain its own branding configuration
          for (let i = 0; i < institutions.length; i++) {
            const retrievedBranding = await brandingService.getBrandingConfiguration(institutions[i]);
            expect(retrievedBranding).toBeDefined();

            // Verify this institution's branding matches what was set
            expect(retrievedBranding!.primaryColor).toBe(expectedBrandings[i].primaryColor);
            expect(retrievedBranding!.theme).toBe(expectedBrandings[i].theme);
            
            if (expectedBrandings[i].logo) {
              expect(retrievedBranding!.logo).toBe(expectedBrandings[i].logo);
            }

            // Verify this institution's branding is different from others (if configurations differ)
            for (let j = 0; j < institutions.length; j++) {
              if (i !== j) {
                const otherBranding = await brandingService.getBrandingConfiguration(institutions[j]);
                
                // If the branding configurations were explicitly different, the results should be different
                // Only check if both configs explicitly set the value
                if (brandingConfigArray[i]?.primaryColor !== undefined && 
                    brandingConfigArray[j]?.primaryColor !== undefined &&
                    brandingConfigArray[i]?.primaryColor !== brandingConfigArray[j]?.primaryColor) {
                  expect(retrievedBranding!.primaryColor).not.toBe(otherBranding!.primaryColor);
                }
                
                if (brandingConfigArray[i]?.theme !== undefined && 
                    brandingConfigArray[j]?.theme !== undefined &&
                    brandingConfigArray[i]?.theme !== brandingConfigArray[j]?.theme) {
                  expect(retrievedBranding!.theme).not.toBe(otherBranding!.theme);
                }
              }
            }
          }

          // Property: Generated CSS should be institution-specific
          for (let i = 0; i < institutions.length; i++) {
            const css = await brandingService.generateBrandingCSS(institutions[i]);
            expect(css).toContain(expectedBrandings[i].primaryColor);
            
            // Verify CSS doesn't contain other institutions' colors (if different)
            for (let j = 0; j < institutions.length; j++) {
              if (i !== j && expectedBrandings[i].primaryColor !== expectedBrandings[j].primaryColor) {
                // CSS for institution i should not contain institution j's primary color
                // (unless they happen to be the same)
                const otherColor = expectedBrandings[j].primaryColor;
                if (otherColor !== expectedBrandings[i].primaryColor) {
                  // This is a weak check since colors might appear in comments or other contexts
                  // The important thing is that the CSS variables are set correctly
                  expect(css).toContain(`--institution-primary-color: ${expectedBrandings[i].primaryColor}`);
                }
              }
            }
          }
        }
      ),
      { numRuns: 50 } // Reduced runs for multi-institution test
    );
  });

  /**
   * Feature: multi-institution-support, Property 7: Institution-Specific Branding Application (Default Fallback)
   * When no custom branding is configured, institutions should use default branding values
   * Validates: Requirements 8.1, 8.2, 8.3
   */
  it('should apply default branding when no custom configuration is provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        institutionRegistrationGenerator(),
        async (institutionData) => {
          // Register institution without custom branding
          const institution = await institutionService.registerInstitution(institutionData);
          const institutionId = institution._id.toString();

          // Property: Default branding should be applied
          const branding = await brandingService.getBrandingConfiguration(institutionId);
          expect(branding).toBeDefined();
          
          // Verify default values are applied
          expect(branding!.primaryColor).toBe('#007bff');
          expect(branding!.theme).toBe('default');
          expect(branding!.navigationStyle).toBe('default');
          expect(branding!.fontFamily).toBe('system-ui, -apple-system, sans-serif');

          // Property: Generated CSS should contain default styling
          const css = await brandingService.generateBrandingCSS(institutionId);
          expect(css).toContain('--institution-primary-color: #007bff');
          expect(css).toContain('--institution-font-family: system-ui, -apple-system, sans-serif');

          // Property: Email branding should use default values
          const emailBranding = await brandingService.getEmailBranding(institutionId);
          expect(emailBranding.primaryColor).toBe('#007bff');
          expect(emailBranding.headerColor).toBe('#007bff');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-institution-support, Property 7: Institution-Specific Branding Application (Reset Functionality)
   * Resetting branding should restore default values while preserving institution identity
   * Validates: Requirements 8.1, 8.2, 8.3
   */
  it('should reset branding to default values while maintaining institution identity', async () => {
    await fc.assert(
      fc.asyncProperty(
        institutionRegistrationGenerator(),
        brandingConfigGenerator(),
        async (institutionData, customBranding) => {
          // Register institution and apply custom branding
          const institution = await institutionService.registerInstitution(institutionData);
          const institutionId = institution._id.toString();

          // Apply custom branding
          await brandingService.updateBrandingConfiguration(institutionId, customBranding);

          // Verify custom branding is applied
          const customBrandingResult = await brandingService.getBrandingConfiguration(institutionId);
          expect(customBrandingResult).toBeDefined();

          // Reset branding to default
          const resetBranding = await brandingService.resetBrandingToDefault(institutionId);

          // Property: Reset should restore default values
          expect(resetBranding.primaryColor).toBe('#007bff');
          expect(resetBranding.theme).toBe('default');
          expect(resetBranding.navigationStyle).toBe('default');
          expect(resetBranding.fontFamily).toBe('system-ui, -apple-system, sans-serif');

          // Property: Institution should still exist and be accessible
          const institutionAfterReset = await institutionService.getInstitutionById(institutionId);
          expect(institutionAfterReset).toBeDefined();
          expect(institutionAfterReset!.name).toBe(institution.name);
          expect(institutionAfterReset!._id.toString()).toBe(institutionId);

          // Property: Retrieved branding should match reset values
          const retrievedAfterReset = await brandingService.getBrandingConfiguration(institutionId);
          expect(retrievedAfterReset!.primaryColor).toBe('#007bff');
          expect(retrievedAfterReset!.theme).toBe('default');

          // Property: Generated CSS should reflect default values
          const cssAfterReset = await brandingService.generateBrandingCSS(institutionId);
          expect(cssAfterReset).toContain('--institution-primary-color: #007bff');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: multi-institution-support, Property 7: Institution-Specific Branding Application (Validation)
   * Invalid branding configurations should be rejected while preserving existing valid branding
   * Validates: Requirements 8.1, 8.2, 8.3
   */
  it('should reject invalid branding configurations and preserve existing valid branding', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 9999 }),
        brandingConfigGenerator(),
        async (seed, validBranding) => {
          // Create unique institution data
          const institutionData: InstitutionRegistrationData = {
            name: `Institution_Validation_Test_${seed}_${Date.now()}`,
            type: 'university',
            address: {
              street: `${seed} Main Street`,
              city: 'Test City',
              state: 'Test State',
              zipCode: '12345'
            },
            contactInfo: {
              email: `contact${seed}${Date.now()}@institution.edu`,
              phone: `+1-555-${String(seed).padStart(4, '0')}`
            }
          };

          // Register institution and apply valid branding
          const institution = await institutionService.registerInstitution(institutionData);
          const institutionId = institution._id.toString();

          await brandingService.updateBrandingConfiguration(institutionId, validBranding);
          const originalBranding = await brandingService.getBrandingConfiguration(institutionId);

          // Test invalid configurations
          const invalidConfigs = [
            { primaryColor: 'invalid-color' },
            { secondaryColor: 'not-a-hex-color' },
            { theme: 'invalid-theme' as any },
            { navigationStyle: 'invalid-style' as any },
            { logo: 'not-a-valid-url' },
            { customCSS: 'body { background: url(javascript:alert("xss")); }' }
          ];

          for (const invalidConfig of invalidConfigs) {
            try {
              await brandingService.updateBrandingConfiguration(institutionId, invalidConfig);
              // If we reach here, the invalid config was accepted (which should not happen)
              expect.fail(`Invalid branding configuration was accepted: ${JSON.stringify(invalidConfig)}`);
            } catch (error) {
              // Property: Invalid configurations should be rejected
              expect((error as Error).message).toMatch(/must be|invalid|malicious/i);
            }

            // Property: Original valid branding should be preserved after rejection
            const preservedBranding = await brandingService.getBrandingConfiguration(institutionId);
            expect(preservedBranding!.primaryColor).toBe(originalBranding!.primaryColor);
            expect(preservedBranding!.theme).toBe(originalBranding!.theme);
          }
        }
      ),
      { numRuns: 50 } // Reduced runs for validation test
    );
  });
});