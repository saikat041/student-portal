import { Request, Response, NextFunction } from 'express';
import { brandingService } from '../services/BrandingService';

interface BrandingRequest extends Request {
  branding?: {
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
  };
  institutionId?: string;
}

/**
 * Middleware to apply institutional branding to requests
 * Requires institutional context to be established first
 */
export const applyInstitutionalBranding = async (
  req: BrandingRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Get institution ID from various possible sources
    const institutionId = req.institutionId || 
                         req.params.institutionId || 
                         req.body.institutionId ||
                         req.query.institutionId as string ||
                         (req as any).user?.currentInstitutionId;

    if (!institutionId) {
      // No institutional context - use default branding
      req.branding = {
        primaryColor: '#007bff',
        secondaryColor: '#6c757d',
        logo: '',
        favicon: '',
        theme: 'default',
        customCSS: '',
        emailTemplate: {
          headerColor: '#007bff',
          footerText: '© 2024 Educational Platform. All rights reserved.',
          logoUrl: ''
        },
        navigationStyle: 'default',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      };
      next();
      return;
    }

    // Get branding configuration for the institution
    const branding = await brandingService.getBrandingConfiguration(institutionId);
    
    if (!branding) {
      // Institution not found or no branding - use default
      req.branding = {
        primaryColor: '#007bff',
        secondaryColor: '#6c757d',
        logo: '',
        favicon: '',
        theme: 'default',
        customCSS: '',
        emailTemplate: {
          headerColor: '#007bff',
          footerText: '© 2024 Educational Platform. All rights reserved.',
          logoUrl: ''
        },
        navigationStyle: 'default',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      };
    } else {
      req.branding = branding;
    }

    // Store institution ID for downstream use
    req.institutionId = institutionId;
    
    next();
  } catch (error) {
    console.error('Branding middleware error:', error);
    
    // On error, use default branding and continue
    req.branding = {
      primaryColor: '#007bff',
      secondaryColor: '#6c757d',
      logo: '',
      favicon: '',
      theme: 'default',
      customCSS: '',
      emailTemplate: {
        headerColor: '#007bff',
        footerText: '© 2024 Educational Platform. All rights reserved.',
        logoUrl: ''
      },
      navigationStyle: 'default',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    };
    
    next();
  }
};

/**
 * Middleware to inject branding CSS into HTML responses
 */
export const injectBrandingCSS = async (
  req: BrandingRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const institutionId = req.institutionId;
    
    if (!institutionId) {
      next();
      return;
    }

    // Generate CSS for the institution
    const brandingCSS = await brandingService.generateBrandingCSS(institutionId);
    
    // Store CSS in response locals for template engines
    res.locals.brandingCSS = brandingCSS;
    res.locals.branding = req.branding;
    
    // Override res.send to inject CSS into HTML responses
    const originalSend = res.send;
    res.send = function(body: any) {
      if (typeof body === 'string' && body.includes('<html>') && brandingCSS) {
        // Inject CSS into HTML head
        const cssTag = `<style id="institution-branding">${brandingCSS}</style>`;
        body = body.replace('</head>', `${cssTag}\n</head>`);
      }
      return originalSend.call(this, body);
    };
    
    next();
  } catch (error) {
    console.error('CSS injection middleware error:', error);
    next(); // Continue without CSS injection on error
  }
};

/**
 * Middleware to add branding headers to API responses
 */
export const addBrandingHeaders = (
  req: BrandingRequest, 
  res: Response, 
  next: NextFunction
): void => {
  if (req.branding) {
    res.setHeader('X-Institution-Theme', req.branding.theme);
    res.setHeader('X-Institution-Primary-Color', req.branding.primaryColor);
    
    if (req.branding.logo) {
      res.setHeader('X-Institution-Logo', req.branding.logo);
    }
  }
  
  next();
};

/**
 * Utility function to get branding from request
 */
export const getBrandingFromRequest = (req: BrandingRequest) => {
  return req.branding || {
    primaryColor: '#007bff',
    secondaryColor: '#6c757d',
    logo: '',
    favicon: '',
    theme: 'default',
    customCSS: '',
    emailTemplate: {
      headerColor: '#007bff',
      footerText: '© 2024 Educational Platform. All rights reserved.',
      logoUrl: ''
    },
    navigationStyle: 'default',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  };
};