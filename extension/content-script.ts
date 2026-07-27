// shop-assistant/extension/content-script.ts
interface ProductData {
  name: string;
  price: number;
  currency: string;
  store: string;
  url: string;
  rating: number | null;
  reviewCount: number | null;
  image: string | null;
  specs: Record<string, string>;
  description: string;
}

function extractSchemaOrg(): Partial<ProductData> | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    try {
      const data = JSON.parse(script.textContent || '');
      const items = data['@graph'] || (Array.isArray(data) ? data : [data]);

      for (const candidate of items) {
        if (candidate['@type'] === 'Product' || candidate['@type']?.includes('Product')) {
          const offers = Array.isArray(candidate.offers) ? candidate.offers[0] : candidate.offers;
          const price = offers?.price !== undefined
            ? parseFloat(offers.price)
            : offers?.lowPrice !== undefined
              ? parseFloat(offers.lowPrice)
              : undefined;
          return {
            name: candidate.name,
            price: price !== undefined && !isNaN(price) ? price : undefined,
            currency: offers?.priceCurrency || 'USD',
            rating: candidate.aggregateRating?.ratingValue
              ? parseFloat(candidate.aggregateRating.ratingValue)
              : null,
            reviewCount: candidate.aggregateRating?.reviewCount
              ? parseInt(candidate.aggregateRating.reviewCount)
              : null,
            image: typeof candidate.image === 'string' ? candidate.image
              : Array.isArray(candidate.image) ? candidate.image[0]
              : candidate.image?.url || null,
            description: candidate.description?.slice(0, 500)
          } as Partial<ProductData>;
        }
      }
    } catch {}
  }
  return null;
}

function extractMetaTags(): Partial<ProductData> | null {
  const getMeta = (prop: string) => {
    const el = document.querySelector(`meta[property="${prop}"]`) ||
               document.querySelector(`meta[name="${prop}"]`);
    return el?.getAttribute('content') || null;
  };

  const price = getMeta('product:price:amount') ||
                getMeta('og:price:amount') ||
                getMeta('twitter:data1');

  if (!price) return null;

  const parsedPrice = parseFloat(price);
  return {
    name: getMeta('og:title') || getMeta('product:title') || document.title,
    price: isNaN(parsedPrice) ? undefined : parsedPrice,
    currency: getMeta('product:price:currency') || getMeta('og:price:currency') || 'USD',
    image: getMeta('og:image'),
    description: getMeta('og:description')?.slice(0, 500),
  } as Partial<ProductData>;
}

function extractDOMHeuristics(): Partial<ProductData> | null {
  const bodyText = document.body?.innerText || '';

  const priceMatch = bodyText.match(/[₹$€£]\s*(\d{1,3}(?:,\d{3})*(?:\.\d{0,2})?)/);
  if (!priceMatch) return null;

  const currencySymbol = priceMatch[0][0];
  const currencyMap: Record<string, string> = { '₹': 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP' };

  const parsedPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
  return {
    price: isNaN(parsedPrice) ? undefined : parsedPrice,
    currency: currencyMap[currencySymbol] || 'USD',
    name: document.title.split('|')[0]?.split('-')[0]?.trim() || document.title,
  } as Partial<ProductData>;
}

function extractStore(): string {
  const hostname = window.location.hostname;
  if (hostname.includes('amazon')) return 'Amazon';
  if (hostname.includes('walmart')) return 'Walmart';
  if (hostname.includes('bestbuy')) return 'Best Buy';
  if (hostname.includes('aliexpress')) return 'AliExpress';
  if (hostname.includes('ebay')) return 'eBay';
  if (hostname.includes('target')) return 'Target';
  if (hostname.includes('costco')) return 'Costco';
  if (hostname.includes('homedepot')) return 'Home Depot';
  if (hostname.includes('lowes')) return 'Lowe\'s';
  return hostname.replace('www.', '').split('.')[0];
}

function isProductPage(): boolean {
  const path = window.location.pathname.toLowerCase();
  const url = window.location.href.toLowerCase();

  const productIndicators = ['/dp/', '/product/', '/item/', '/p/', '/products/', '/gp/product/'];
  if (productIndicators.some(p => path.includes(p))) return true;

  const hasSchema = !!document.querySelector('script[type="application/ld+json"]');
  const hasAddToCart = !!document.querySelector('[data-testid="add-to-cart"], .add-to-cart, button[name="add"]');
  const hasPrice = !!document.querySelector('[data-price], .price, [itemprop="price"]');

  return (hasSchema && hasPrice) || (hasAddToCart && hasPrice);
}

function buildProductData(): ProductData | null {
  if (!isProductPage()) return null;

  const schema = extractSchemaOrg();
  const meta = extractMetaTags();
  const dom = extractDOMHeuristics();

  const merged: ProductData = {
    name: schema?.name || meta?.name || dom?.name || document.title,
    price: schema?.price ?? meta?.price ?? dom?.price ?? 0,
    currency: schema?.currency || meta?.currency || dom?.currency || 'USD',
    store: extractStore(),
    url: window.location.href,
    rating: schema?.rating ?? meta?.rating ?? null,
    reviewCount: schema?.reviewCount ?? null,
    image: schema?.image || meta?.image || null,
    specs: {},
    description: schema?.description || meta?.description || '',
  };

  if (!merged.price) {
    const priceEl = document.querySelector('[data-a-color-price] [class*="a-price-whole"], .a-price-whole, [data-price], [itemprop="price"]');
    const priceText = priceEl?.getAttribute('content') || priceEl?.textContent || '';
    const found = parseFloat(priceText.replace(/[^0-9.]/g, ''));
    if (!isNaN(found)) merged.price = found;
  }

  return merged;
}

/** Return the currently focused element's text content and metadata. */
function getFocusedElementInfo(): { text: string; placeholder: string; tag: string; selector: string } | null {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return null;
  const tag = el.tagName.toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || el.isContentEditable;
  if (!isInput) return null;
  const value = ((el as HTMLInputElement).value ?? el.textContent ?? '').slice(0, 5000);
  const placeholder = (el as HTMLInputElement).placeholder ?? '';
  if (!value && !placeholder) return null;
  return { text: value, placeholder: placeholder.slice(0, 200), tag, selector: el.id ? `#${el.id}` : tag };
}

/** Listen for runtime messages from the side panel or service worker. */
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message.type === 'get:focusedElement') {
    sendResponse({ data: getFocusedElementInfo() ?? { text: '', placeholder: '', tag: '', selector: '' } });
  }
  return true; // Keep channel open for async response
});

if (typeof document !== 'undefined' && document.body && document.createElement) {
  const tempEl = document.createElement('div');
  if (tempEl && tempEl.style) {
    const isProduct = isProductPage();

    if (isProduct) {
      console.log('[Obot] isProductPage: true');
      console.log('[Obot] Running product extractors...');
      const schema = extractSchemaOrg();
      console.log('[Obot] Schema.org result:', schema);
      const meta = extractMetaTags();
      console.log('[Obot] Meta tags result:', meta);
      const dom = extractDOMHeuristics();
      console.log('[Obot] DOM heuristics result:', dom);

      const product = buildProductData();
      console.log('[Obot] Built product data:', product);

      if (product && product.price > 0) {
        console.log('[Obot] Sending product:detected message');
        chrome.runtime.sendMessage({ type: 'product:detected', data: product });
      } else {
        console.log('[Obot] Product rejected — price:', product?.price);
      }
    }
  }
}


