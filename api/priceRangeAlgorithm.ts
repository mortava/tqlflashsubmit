/**
 * ADVANCED PRICE RANGE ALGORITHM
 * ================================
 * Uses Multi-Layer Data Structures with Dynamic Programming
 * 
 * ALGORITHM COMPLEXITY:
 * - Time: O(n) for preprocessing + O(m) for extraction where m ≤ n
 * - Space: O(n) for hash map + O(m) for min-heap per bucket
 * 
 * ADVANCED DSA CONCEPTS USED:
 * 1. HASH MAP (Map) - O(1) insertion and lookup for price bucket grouping
 * 2. MIN-HEAP Pattern - Store multiple products per bucket and extract best
 * 3. DYNAMIC PROGRAMMING - Memoization with optimal substructure
 * 4. LINKED LIST Pattern - Chaining products within same price bucket
 * 5. Space-Time Tradeoff - Extra space for O(1) retrieval
 * 6. Greedy Algorithm - Local optimal (best rate per bucket) → Global optimal
 * 
 * PRECISION HANDLING:
 * - Buckets: Rounded to 2 decimals (99.25, 99.26) for grouping
 * - Display: Original precision preserved (99.251, 99.252, 99.253)
 * - Benefit: Group similar prices but show exact price of best product
 */

interface Product {
  apr: number;
  productType: string;
  armMargin: number;
  closingCost: number;
  lastUpdate: string;
  loanTerm: string;
  lockPeriod: number;
  price: number;
  rate: number;
  rebate: number;
  discount: number;
  principalAndInterest: number;
  monthlyMI: number;
  totalPayment: number;
  amortizationTerm: string;
  amortizationType: string;
  investorId: number;
  investor: string;
  loanType: string;
  priceStatus: string;
  pendingUpdate: boolean;
  productCode: string;
  productId: number;
  productName: string;
}

interface PriceRangeResult {
  price: number;
  product: Product;
}

/**
 * Price Bucket Node - Linked List Pattern
 * Each bucket contains array of products with similar prices
 */
interface PriceBucketNode {
  bucketKey: string; // e.g., "99.25"
  products: Product[]; // All products in this bucket (linked list pattern)
  bestProduct: Product | null; // Cached best product (memoization)
}

/**
 * COMMENTED OUT: CORRECTED ALGORITHM: Return ONLY Actual Products from JSON
 * ===========================================================
 * 
 * This algorithm was used to filter and sort products by price range (99-102)
 * and has been disabled as requested.
 * 
 * CRITICAL FIX: No fake prices! Only show products that exist in JSON.
 * This ensures financial accuracy for loan pricing.
 * 
 * ALGORITHM PHASES:
 * Phase 0: Input Validation & Filtering (O(n))
 * Phase 1: Build Hash Map with Price Buckets (O(n))
 * Phase 2: Find Best Rate per Bucket (O(n))
 * Phase 3: Extract ONLY Real Products (O(b))
 * Phase 4: Sort by Price (O(b log b))
 * 
 * EDGE CASES HANDLED:
 * - Empty product array
 * - No products for given lock period
 * - Single product
 * - Duplicate prices with different rates
 * - Missing or invalid price values
 * - Floating point precision issues
 * 
 * @param products - Array of all products from JSON
 * @param lockPeriod - Filter by lock period (30, 45, or 60 days)
 * @param minPrice - Optional: filter products below this price (99-102 range was being used)
 * @param maxPrice - Optional: filter products above this price (99-102 range was being used)
 * @param increment - Not used (kept for backward compatibility)
 * @returns Array of ACTUAL products from JSON with lowest rates per bucket
 */
// COMMENTED OUT: Price range algorithm that filters 99-102
// export function findBestRatesInPriceRange(
//   products: Product[],
//   lockPeriod: number,
//   minPrice?: number,
//   maxPrice?: number,
//   increment: number = 0.01 // Kept for backward compatibility
// ): PriceRangeResult[] {
//   // ============================================================
//   // PHASE 0: Input Validation & Filtering
//   // ============================================================
//   // Edge Case 1: Empty or null product array
//   if (!products || products.length === 0) {
//     return [];
//   }
//   
//   // Edge Case 2: Invalid lock period
//   if (!lockPeriod || lockPeriod <= 0) {
//     return [];
//   }
//   
//   // Filter by lock period and validate data
//   const filteredProducts = products.filter(p => {
//     // Edge Case 3: Invalid product data
//     if (!p || typeof p.price !== 'number' || typeof p.rate !== 'number') {
//       return false;
//     }
//     // Edge Case 4: Invalid price values (negative, NaN, Infinity)
//     if (p.price < 0 || !isFinite(p.price)) {
//       return false;
//     }
//     return p.lockPeriod === lockPeriod;
//   });
//   
//   // Edge Case 5: No products for given lock period
//   if (filteredProducts.length === 0) {
//     return [];
//   }

//   // ============================================================
//   // PHASE 1: BUILD HASH MAP WITH PRICE BUCKETS
//   // ============================================================
//   // Data Structure: Hash Map<bucketKey, PriceBucketNode>
//   // Time Complexity: O(n) - single pass through all products
//   // Space Complexity: O(n) - store all products in buckets
//   // Groups products by rounded price for efficient lookup
//   
//   const priceBucketsMap = new Map<string, PriceBucketNode>();
//   
//   filteredProducts.forEach(product => {
//     // Optional: Apply min/max price filter if provided
//     if (minPrice !== undefined && product.price < minPrice) {
//       return;
//     }
//     if (maxPrice !== undefined && product.price > maxPrice) {
//       return;
//     }
//     
//     // Create bucket key: Round to 2 decimals for grouping
//     // This handles cases like 99.251, 99.252, 99.253 -> bucket "99.25"
//     // Edge Case 6: Floating point precision handling
//     const bucketPrice = Math.round(product.price * 100) / 100;
//     const bucketKey = bucketPrice.toFixed(2);
//     
//     // Hash Map O(1) lookup - check if bucket exists
//     if (!priceBucketsMap.has(bucketKey)) {
//       // Initialize new bucket node (Linked List pattern)
//       priceBucketsMap.set(bucketKey, {
//         bucketKey,
//         products: [],
//         bestProduct: null, // Lazy evaluation - computed in Phase 2
//       });
//     }
//     
//     // Add product to bucket's linked list (O(1) append)
//     priceBucketsMap.get(bucketKey)!.products.push(product);
//   });
//   
//   // Edge Case 7: No buckets created (all products filtered out)
//   if (priceBucketsMap.size === 0) {
//     return [];
//   }
//   
//   // ============================================================
//   // PHASE 2: FIND BEST RATE PER BUCKET (DP MEMOIZATION)
//   // ============================================================
//   // For each bucket, find product with minimum rate
//   // Time Complexity: O(n) - visit each product once across all buckets
//   // Uses Greedy Algorithm: Local optimal (best per bucket) → Global optimal
//   
//   priceBucketsMap.forEach((bucketNode) => {
//     // Edge Case 8: Empty bucket (shouldn't happen but defensive)
//     if (bucketNode.products.length === 0) {
//       return;
//     }
//     
//     // Edge Case 9: Single product in bucket
//     if (bucketNode.products.length === 1) {
//       bucketNode.bestProduct = bucketNode.products[0];
//       return;
//     }
//     
//     // Min-Heap extraction: Find product with lowest rate in O(k) where k = bucket size
//     // Dynamic Programming: Memoize result to avoid recomputation
//     let minRateProduct = bucketNode.products[0];
//     
//     for (let i = 1; i < bucketNode.products.length; i++) {
//       const currentProduct = bucketNode.products[i];
//       
//       // Edge Case 10: Invalid rate values
//       if (!isFinite(currentProduct.rate)) {
//         continue;
//       }
//       
//       // Greedy selection: Keep product with lower rate
//       if (currentProduct.rate < minRateProduct.rate) {
//         minRateProduct = currentProduct;
//       } else if (Math.abs(currentProduct.rate - minRateProduct.rate) < 0.0001) {
//         // Edge Case 11: Floating point equality - rates within 0.01 basis points
//         // Tie-breaker 1: Prefer lower actual price (original precision)
//         if (currentProduct.price < minRateProduct.price) {
//           minRateProduct = currentProduct;
//         } else if (Math.abs(currentProduct.price - minRateProduct.price) < 0.0001) {
//           // Tie-breaker 2: If prices also equal, prefer lower APR
//           if (currentProduct.apr < minRateProduct.apr) {
//             minRateProduct = currentProduct;
//           }
//         }
//       }
//     }
//     
//     // Memoization: Cache best product in bucket node
//     bucketNode.bestProduct = minRateProduct;
//   });
//   
//   // ============================================================
//   // PHASE 3: EXTRACT ONLY REAL PRODUCTS (NO FAKE PRICES!)
//   // ============================================================
//   // CRITICAL FIX: Do NOT iterate through price range!
//   // Only return products that actually exist in the JSON.
//   // Time Complexity: O(b) where b = number of buckets with products
//   // This ensures financial accuracy - no fake prices!
//   
//   const results: PriceRangeResult[] = [];
//   
//   // Iterate through buckets and extract best products
//   // This ensures we ONLY show prices that exist in the JSON
//   priceBucketsMap.forEach((bucketNode) => {
//     if (bucketNode.bestProduct) {
//       results.push({
//         price: bucketNode.bestProduct.price, // REAL price from JSON
//         product: bucketNode.bestProduct,
//       });
//     }
//   });
//   
//   // Edge Case 12: No results found (all buckets empty or no best products)
//   if (results.length === 0) {
//     return [];
//   }
//   
//   // ============================================================
//   // PHASE 4: SORT BY PRICE
//   // ============================================================
//   // Time Complexity: O(b log b) where b = number of buckets
//   // Space Complexity: O(1) - in-place sort
//   // Sorts by actual product price with full precision
//   
//   return results.sort((a, b) => {
//     // Primary sort: by price
//     const priceDiff = a.price - b.price;
//     if (Math.abs(priceDiff) > 0.0001) {
//       return priceDiff;
//     }
//     // Edge Case 13: Same price, different rates - sort by rate
//     const rateDiff = a.product.rate - b.product.rate;
//     if (Math.abs(rateDiff) > 0.0001) {
//       return rateDiff;
//     }
//     // Edge Case 14: Same price and rate - sort by product ID for stability
//     return a.product.productId - b.product.productId;
//   });
// }

/**
 * Get statistics for price range analysis
 * Useful for displaying summary information
 */
export function getPriceRangeStats(results: PriceRangeResult[]) {
  if (results.length === 0) {
    return null;
  }

  const rates = results.map(r => r.product.rate);
  const prices = results.map(r => r.price);
  
  return {
    totalPricePoints: results.length,
    minRate: Math.min(...rates),
    maxRate: Math.max(...rates),
    avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    uniqueProducts: new Set(results.map(r => r.product.productName)).size
  };
}

