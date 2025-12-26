import mongoose from 'mongoose';
import Institution, { IInstitution } from '../models/Institution';

export interface BrandingConfiguration {
  primaryColor: string;
  secondaryColor?: string;
  logo: string;
  favicon?: string;
  theme: string;
  customCSS?: string;
  emailTemplate?: {
    headerColor?: string;
    footerText?: string;
    logoUrl?: string;
  };
  navigationStyle?: 'default' | 'minimal' | 'sidebar';
  fontFamily?: string;
}

export interface BrandingAssets {
  logo?: Express.Multer.File;
  favicon?: Express.Multer.File;
  customCSS?: string;
}

export class BrandingService {
  private static instance: BrandingService;

  private constructor() {}

  public static getInstance(): BrandingService {
    if (!BrandingService.instance) {
      BrandingService.instance = new BrandingService();
    }
    return BrandingService.instance;
  }

  /**
   * Get branding configuration for an institution
   */
  async getBrandingConfiguration(institutionId: string): Promise<BrandingConfiguration | null> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return null;
    }

    return {
      primaryColor: institution.branding.primaryColor,
      secondaryColor: institution.branding.secondaryColor,
      logo: institution.branding.logo,
      favicon: institution.branding.favicon,
      theme: institution.branding.theme,
      customCSS: institution.branding.customCSS,
      emailTemplate: institution.branding.emailTemplate,
      navigationStyle: institution.branding.navigationStyle,
      fontFamily: institution.branding.fontFamily
    };
  }

  /**
   * Update branding configuration for an institution
   */
  async updateBrandingConfiguration(
    institutionId: string, 
    brandingConfig: Partial<BrandingConfiguration>
  ): Promise<BrandingConfiguration> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Validate branding configuration
    this.validateBrandingConfiguration(brandingConfig);

    // Update branding fields
    if (brandingConfig.primaryColor) {
      institution.branding.primaryColor = brandingConfig.primaryColor;
    }
    
    if (brandingConfig.secondaryColor) {
      institution.branding.secondaryColor = brandingConfig.secondaryColor;
    }
    
    if (brandingConfig.logo) {
      institution.branding.logo = brandingConfig.logo;
    }
    
    if (brandingConfig.favicon) {
      institution.branding.favicon = brandingConfig.favicon;
    }
    
    if (brandingConfig.theme) {
      institution.branding.theme = brandingConfig.theme;
    }
    
    if (brandingConfig.customCSS) {
      institution.branding.customCSS = brandingConfig.customCSS;
    }
    
    if (brandingConfig.emailTemplate) {
      institution.branding.emailTemplate = {
        ...institution.branding.emailTemplate,
        ...brandingConfig.emailTemplate
      };
    }
    
    if (brandingConfig.navigationStyle) {
      institution.branding.navigationStyle = brandingConfig.navigationStyle;
    }
    
    if (brandingConfig.fontFamily) {
      institution.branding.fontFamily = brandingConfig.fontFamily;
    }

    await institution.save();

    return {
      primaryColor: institution.branding.primaryColor,
      secondaryColor: institution.branding.secondaryColor,
      logo: institution.branding.logo,
      favicon: institution.branding.favicon,
      theme: institution.branding.theme,
      customCSS: institution.branding.customCSS,
      emailTemplate: institution.branding.emailTemplate,
      navigationStyle: institution.branding.navigationStyle,
      fontFamily: institution.branding.fontFamily
    };
  }

  /**
   * Reset branding to default values
   */
  async resetBrandingToDefault(institutionId: string): Promise<BrandingConfiguration> {
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      throw new Error('Invalid institution ID format');
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      throw new Error('Institution not found');
    }

    // Reset to default branding
    institution.branding = {
      primaryColor: '#007bff',
      secondaryColor: '#6c757d',
      logo: '',
      favicon: '',
      theme: 'default',
      customCSS: '',
      emailTemplate: {
        headerColor: '#007bff',
        footerText: `© ${new Date().getFullYear()} ${institution.name}. All rights reserved.`,
        logoUrl: ''
      },
      navigationStyle: 'default',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    };

    await institution.save();

    return {
      primaryColor: institution.branding.primaryColor,
      secondaryColor: institution.branding.secondaryColor,
      logo: institution.branding.logo,
      favicon: institution.branding.favicon,
      theme: institution.branding.theme,
      customCSS: institution.branding.customCSS,
      emailTemplate: institution.branding.emailTemplate,
      navigationStyle: institution.branding.navigationStyle,
      fontFamily: institution.branding.fontFamily
    };
  }

  /**
   * Generate CSS variables for institution branding
   */
  async generateBrandingCSS(institutionId: string): Promise<string> {
    const branding = await this.getBrandingConfiguration(institutionId);
    if (!branding) {
      return this.getDefaultBrandingCSS();
    }

    let css = `:root {
  --institution-primary-color: ${branding.primaryColor};
  --institution-secondary-color: ${branding.secondaryColor || '#6c757d'};
  --institution-font-family: ${branding.fontFamily || 'system-ui, -apple-system, sans-serif'};
}

.institution-branding {
  --primary: var(--institution-primary-color);
  --secondary: var(--institution-secondary-color);
  font-family: var(--institution-font-family);
}

.institution-logo {
  background-image: url('${branding.logo}');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.institution-theme-${branding.theme} {
  /* Theme-specific styles */
}`;

    // Add navigation style-specific CSS
    if (branding.navigationStyle === 'minimal') {
      css += `
.navbar-minimal {
  border: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}`;
    } else if (branding.navigationStyle === 'sidebar') {
      css += `
.sidebar-navigation {
  background-color: var(--institution-primary-color);
  color: white;
}`;
    }

    // Add custom CSS if provided
    if (branding.customCSS) {
      css += `\n\n/* Custom Institution CSS */\n${branding.customCSS}`;
    }

    return css;
  }

  /**
   * Get default branding CSS
   */
  private getDefaultBrandingCSS(): string {
    return `:root {
  --institution-primary-color: #007bff;
  --institution-secondary-color: #6c757d;
  --institution-font-family: system-ui, -apple-system, sans-serif;
}

.institution-branding {
  --primary: var(--institution-primary-color);
  --secondary: var(--institution-secondary-color);
  font-family: var(--institution-font-family);
}`;
  }

  /**
   * Get branding for email templates
   */
  async getEmailBranding(institutionId: string): Promise<{
    headerColor: string;
    footerText: string;
    logoUrl: string;
    primaryColor: string;
  }> {
    const branding = await this.getBrandingConfiguration(institutionId);
    const institution = await Institution.findById(institutionId);
    
    if (!branding || !institution) {
      return {
        headerColor: '#007bff',
        footerText: '© 2024 Educational Institution. All rights reserved.',
        logoUrl: '',
        primaryColor: '#007bff'
      };
    }

    return {
      headerColor: branding.emailTemplate?.headerColor || branding.primaryColor,
      footerText: branding.emailTemplate?.footerText || `© ${new Date().getFullYear()} ${institution.name}. All rights reserved.`,
      logoUrl: branding.emailTemplate?.logoUrl || branding.logo,
      primaryColor: branding.primaryColor
    };
  }

  /**
   * Validate branding configuration
   */
  private validateBrandingConfiguration(config: Partial<BrandingConfiguration>): void {
    // Validate color formats (hex colors)
    if (config.primaryColor && !this.isValidHexColor(config.primaryColor)) {
      throw new Error('Primary color must be a valid hex color');
    }
    
    if (config.secondaryColor && !this.isValidHexColor(config.secondaryColor)) {
      throw new Error('Secondary color must be a valid hex color');
    }

    // Validate theme
    if (config.theme && !['default', 'dark', 'light', 'custom'].includes(config.theme)) {
      throw new Error('Theme must be one of: default, dark, light, custom');
    }

    // Validate navigation style
    if (config.navigationStyle && !['default', 'minimal', 'sidebar'].includes(config.navigationStyle)) {
      throw new Error('Navigation style must be one of: default, minimal, sidebar');
    }

    // Validate URLs (basic validation)
    if (config.logo && config.logo.length > 0 && !this.isValidUrl(config.logo)) {
      throw new Error('Logo must be a valid URL');
    }
    
    if (config.favicon && config.favicon.length > 0 && !this.isValidUrl(config.favicon)) {
      throw new Error('Favicon must be a valid URL');
    }

    // Validate CSS (basic check for malicious content)
    if (config.customCSS && this.containsMaliciousCSS(config.customCSS)) {
      throw new Error('Custom CSS contains potentially malicious content');
    }
  }

  /**
   * Check if string is a valid hex color
   */
  private isValidHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  /**
   * Basic URL validation
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Basic check for malicious CSS content
   */
  private containsMaliciousCSS(css: string): boolean {
    const maliciousPatterns = [
      /javascript:/i,
      /expression\(/i,
      /behavior:/i,
      /@import/i,
      /url\s*\(\s*["']?javascript:/i
    ];

    return maliciousPatterns.some(pattern => pattern.test(css));
  }
}

// Export both the class and a default instance
export const brandingService = BrandingService.getInstance();
export default brandingService;