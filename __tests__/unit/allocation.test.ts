import { calculateAllocation, Warehouse } from '@/lib/allocation/calculator';

describe('Allocation Algorithm', () => {
  // Test data we'll reuse across tests
  const mockWarehouses: Warehouse[] = [
    {
      id: 'WH-EAST',
      name: 'East Coast DC',
      forecast: 10, // units per day
      onHand: 50,
      inTransit: 0,
    },
    {
      id: 'WH-WEST',
      name: 'West Coast DC',
      forecast: 20,
      onHand: 40,
      inTransit: 0,
    },
  ];

  const SKU_PACK_SIZE = 12; // SKU-level pack size

  describe('Auto Mode', () => {
    it('should allocate entire order quantity respecting pack sizes', () => {
      // ARRANGE: Set up test data
      const input = {
        warehouses: mockWarehouses,
        orderQuantity: 240,
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // ACT: Run the function
      const result = calculateAllocation(input);

      // ASSERT: Check the results
      const totalAllocated = result.reduce((sum, wh) => sum + wh.allocatedUnits, 0);
      expect(totalAllocated).toBe(240);
    });

    it('should allocate to warehouse with lowest coverage first', () => {
      // ARRANGE
      const input = {
        warehouses: mockWarehouses,
        orderQuantity: 120,
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // WH-EAST: 50 onHand / 10 forecast = 5 days coverage
      // WH-WEST: 40 onHand / 20 forecast = 2 days coverage
      // WH-WEST has lower coverage, should get first allocation

      // ACT
      const result = calculateAllocation(input);

      // ASSERT
      const westCoast = result.find(wh => wh.id === 'WH-WEST');
      const eastCoast = result.find(wh => wh.id === 'WH-EAST');

      expect(westCoast!.allocatedUnits).toBeGreaterThan(eastCoast!.allocatedUnits);
    });

    it('should handle zero forecast without crashing', () => {
      // ARRANGE: Warehouse with zero forecast (edge case)
      const warehousesWithZeroForecast: Warehouse[] = [
        {
          id: 'WH-1',
          name: 'Warehouse 1',
          forecast: 0, // Zero forecast - could cause division by zero!
          onHand: 100,
          inTransit: 0,
        },
        {
          id: 'WH-2',
          name: 'Warehouse 2',
          forecast: 10,
          onHand: 50,
          inTransit: 0,
        },
      ];

      const input = {
        warehouses: warehousesWithZeroForecast,
        orderQuantity: 120,
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // ACT & ASSERT: Should not throw error
      expect(() => calculateAllocation(input)).not.toThrow();

      const result = calculateAllocation(input);
      // All allocation should go to WH-2 (the one with forecast)
      expect(result[1].allocatedUnits).toBe(120);
    });

    it('should respect pack size constraints', () => {
      // ARRANGE
      const input = {
        warehouses: mockWarehouses,
        orderQuantity: 240,
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT: Every allocated amount should be divisible by pack size
      result.forEach(wh => {
        expect(wh.allocatedUnits % wh.packSize).toBe(0);
      });
    });

    it('should handle order quantity smaller than pack size', () => {
      // ARRANGE: Edge case - order is too small for even one pack
      const input = {
        warehouses: mockWarehouses,
        orderQuantity: 6, // Less than pack size of 12
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT: Should allocate nothing (can't ship partial packs)
      const totalAllocated = result.reduce((sum, wh) => sum + wh.allocatedUnits, 0);
      expect(totalAllocated).toBe(0);
    });
  });

  describe('Manual Mode', () => {
    it('should distribute by percentages', () => {
      // ARRANGE
      const input = {
        warehouses: mockWarehouses,
        orderQuantity: 240,
        allocationMode: 'manual' as const,
        packSize: SKU_PACK_SIZE,
        warehousePercentages: {
          'WH-EAST': 25,  // 25% = 60 units = 5 packs
          'WH-WEST': 75,  // 75% = 180 units = 15 packs
        },
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT
      const eastCoast = result.find(wh => wh.id === 'WH-EAST');
      const westCoast = result.find(wh => wh.id === 'WH-WEST');

      expect(eastCoast!.allocatedUnits).toBe(60);
      expect(westCoast!.allocatedUnits).toBe(180);
    });

    it('should normalize percentages that do not sum to 100', () => {
      // ARRANGE: Percentages sum to 60, not 100
      const input = {
        warehouses: mockWarehouses,
        orderQuantity: 240,
        allocationMode: 'manual' as const,
        packSize: SKU_PACK_SIZE,
        warehousePercentages: {
          'WH-EAST': 20,  // 20/60 = 33.3%
          'WH-WEST': 40,  // 40/60 = 66.7%
        },
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT: Should still allocate most/all units
      const totalAllocated = result.reduce((sum, wh) => sum + wh.allocatedUnits, 0);
      expect(totalAllocated).toBeGreaterThan(0);
      expect(totalAllocated).toBeLessThanOrEqual(240);

      // Should respect the ratio (40 is 2x of 20)
      const eastCoast = result.find(wh => wh.id === 'WH-EAST');
      const westCoast = result.find(wh => wh.id === 'WH-WEST');
      expect(westCoast!.allocatedUnits).toBeGreaterThan(eastCoast!.allocatedUnits);
    });

    it('should handle missing warehouse in percentages', () => {
      // ARRANGE: Only specify percentage for one warehouse
      const input = {
        warehouses: mockWarehouses,
        orderQuantity: 240,
        allocationMode: 'manual' as const,
        packSize: SKU_PACK_SIZE,
        warehousePercentages: {
          'WH-EAST': 100,  // Only specify one warehouse
          // WH-WEST not specified
        },
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT: All should go to WH-EAST
      const eastCoast = result.find(wh => wh.id === 'WH-EAST');
      const westCoast = result.find(wh => wh.id === 'WH-WEST');

      expect(eastCoast!.allocatedUnits).toBeGreaterThan(0);
      expect(westCoast!.allocatedUnits).toBe(0);
    });
  });

  describe('Coverage Calculations', () => {
    it('should calculate coverage before and after correctly', () => {
      // ARRANGE
      const input = {
        warehouses: [
          {
            id: 'WH-1',
            name: 'Warehouse 1',
            forecast: 10, // 10 units/day
            onHand: 50,
            inTransit: 0,
          }
        ],
        orderQuantity: 120, // 10 packs
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT
      // Before: 50 units / 10 per day = 5 days
      expect(result[0].coverageBefore).toBe(5);

      // After: (50 + 120) units / 10 per day = 17 days
      expect(result[0].coverageAfter).toBe(17);
    });

    it('should include in-transit inventory in coverage calculation', () => {
      // ARRANGE
      const input = {
        warehouses: [
          {
            id: 'WH-1',
            name: 'Warehouse 1',
            forecast: 10,
            onHand: 30,
            inTransit: 20, // Should be included in coverage
          }
        ],
        orderQuantity: 120,
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT
      // Before: (30 onHand + 20 inTransit) / 10 per day = 5 days
      expect(result[0].coverageBefore).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty warehouses array', () => {
      // ARRANGE
      const input = {
        warehouses: [],
        orderQuantity: 240,
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT
      expect(result).toEqual([]);
    });

    it('should handle zero order quantity', () => {
      // ARRANGE
      const input = {
        warehouses: mockWarehouses,
        orderQuantity: 0,
        allocationMode: 'auto' as const,
        packSize: SKU_PACK_SIZE,
      };

      // ACT
      const result = calculateAllocation(input);

      // ASSERT: No allocation should occur
      result.forEach(wh => {
        expect(wh.allocatedUnits).toBe(0);
      });
    });
  });
});
