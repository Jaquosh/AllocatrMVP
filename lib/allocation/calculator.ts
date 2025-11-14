// Pure business logic for warehouse allocation
// Extracted from dashboard component for testing

export interface Warehouse {
  id: string;
  name: string;
  forecast: number;
  onHand: number;
  inTransit: number;
  packSize: number;
}

export interface AllocationResult extends Warehouse {
  targetUnits: number;
  gap: number;
  allocatedUnits: number;
  coverageBefore: number;
  coverageAfter: number;
}

export interface AllocationInput {
  warehouses: Warehouse[];
  orderQuantity: number;
  coverageDays: number;
  allocationMode: 'auto' | 'manual';
  warehousePercentages?: Record<string, number>;
}

/**
 * Calculate warehouse allocation based on inventory gaps and forecasts
 * @param input - Allocation parameters including warehouses, order quantity, and mode
 * @returns Array of allocation results with calculated units for each warehouse
 */
export function calculateAllocation(input: AllocationInput): AllocationResult[] {
  const { warehouses, orderQuantity, coverageDays, allocationMode, warehousePercentages = {} } = input;

  // Step 1: Calculate initial state for each warehouse
  const warehousesWithGaps = warehouses.map((wh) => {
    const targetUnits = wh.forecast * coverageDays;
    const currentInventory = wh.onHand + wh.inTransit;
    const gap = Math.max(0, targetUnits - currentInventory);
    const coverageBefore = wh.forecast > 0 ? currentInventory / wh.forecast : 0;

    return {
      ...wh,
      targetUnits,
      gap,
      currentInventory,
      coverageBefore,
      allocatedUnits: 0,
    };
  });

  let remainingUnits = orderQuantity;

  if (allocationMode === 'manual') {
    // Manual mode: allocate by percentages
    const totalPercentages = Object.values(warehousePercentages).reduce((sum, p) => sum + p, 0);

    warehousesWithGaps.forEach((wh) => {
      const normalizedPercentage = totalPercentages > 0 ? (warehousePercentages[wh.id] || 0) / totalPercentages : 0;
      const rawAllocation = normalizedPercentage * orderQuantity;
      wh.allocatedUnits = Math.floor(rawAllocation / wh.packSize) * wh.packSize;
    });

    const totalAllocated = warehousesWithGaps.reduce((sum, wh) => sum + wh.allocatedUnits, 0);
    remainingUnits = orderQuantity - totalAllocated;

    // Distribute remaining units by remainder
    const withRemainders = warehousesWithGaps.map((wh) => {
      const normalizedPercentage = totalPercentages > 0 ? (warehousePercentages[wh.id] || 0) / totalPercentages : 0;
      const rawAllocation = normalizedPercentage * orderQuantity;
      const remainder = rawAllocation - wh.allocatedUnits;
      return { wh, remainder };
    }).sort((a, b) => b.remainder - a.remainder);

    for (const { wh } of withRemainders) {
      if (remainingUnits >= wh.packSize) {
        wh.allocatedUnits += wh.packSize;
        remainingUnits -= wh.packSize;
      }
    }
  } else {
    // Auto mode: BALANCED COVERAGE ALLOCATION
    // Greedy algorithm: repeatedly allocate to warehouse with lowest coverage
    while (remainingUnits > 0) {
      let lowestCoverageWH = null;
      let lowestCoverage = Infinity;

      for (const wh of warehousesWithGaps) {
        if (remainingUnits < wh.packSize) continue;

        const inventoryAfter = wh.currentInventory + wh.allocatedUnits;
        const coverageAfter = wh.forecast > 0 ? inventoryAfter / wh.forecast : Infinity;

        if (coverageAfter < lowestCoverage) {
          lowestCoverage = coverageAfter;
          lowestCoverageWH = wh;
        }
      }

      if (!lowestCoverageWH) break;

      lowestCoverageWH.allocatedUnits += lowestCoverageWH.packSize;
      remainingUnits -= lowestCoverageWH.packSize;
    }
  }

  // Calculate final results with coverage metrics
  return warehousesWithGaps.map((wh) => {
    const inventoryAfter = wh.currentInventory + wh.allocatedUnits;
    const coverageAfter = wh.forecast > 0 ? inventoryAfter / wh.forecast : 0;

    return {
      id: wh.id,
      name: wh.name,
      forecast: wh.forecast,
      onHand: wh.onHand,
      inTransit: wh.inTransit,
      packSize: wh.packSize,
      targetUnits: wh.targetUnits,
      gap: wh.gap,
      allocatedUnits: wh.allocatedUnits,
      coverageBefore: wh.coverageBefore,
      coverageAfter,
    };
  });
}
