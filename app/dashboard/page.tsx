'use client';

import { useState } from 'react';

interface Warehouse {
  id: string;
  name: string;
  forecast: number; // units per day
  onHand: number;
  inTransit: number;
  packSize: number;
  capacityMax?: number;
  minPresentation?: number;
}

interface AllocationResult extends Warehouse {
  targetUnits: number;
  gap: number;
  allocatedUnits: number;
  coverageBefore: number;
  coverageAfter: number;
}

export default function DashboardPage() {
  const [sku, setSku] = useState('SHOE-001');
  const [orderQuantity, setOrderQuantity] = useState(1000);
  const [coverageDays, setCoverageDays] = useState(21);
  const [totalDailyForecast, setTotalDailyForecast] = useState(70); // Total units/day across all warehouses
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto');
  const [warehousePercentages, setWarehousePercentages] = useState<Record<string, number>>({
    'WH-EAST': 25,
    'WH-WEST': 25,
    'WH-CENTRAL': 25,
    'WH-SOUTH': 25,
  });
  const [warehouseFulfillmentPercentages, setWarehouseFulfillmentPercentages] = useState<Record<string, number>>({
    'WH-EAST': 21.4, // 15/70 = 21.4%
    'WH-WEST': 35.7, // 25/70 = 35.7%
    'WH-CENTRAL': 14.3, // 10/70 = 14.3%
    'WH-SOUTH': 28.6, // 20/70 = 28.6%
  });
  const [results, setResults] = useState<AllocationResult[] | null>(null);

  // Mock warehouse data
  const mockWarehouses: Warehouse[] = [
    {
      id: 'WH-EAST',
      name: 'East Coast DC',
      forecast: 15, // units per day
      onHand: 100,
      inTransit: 50,
      packSize: 12,
    },
    {
      id: 'WH-WEST',
      name: 'West Coast DC',
      forecast: 25,
      onHand: 80,
      inTransit: 0,
      packSize: 12,
    },
    {
      id: 'WH-CENTRAL',
      name: 'Central DC',
      forecast: 10,
      onHand: 200,
      inTransit: 100,
      packSize: 12,
    },
    {
      id: 'WH-SOUTH',
      name: 'Southern DC',
      forecast: 20,
      onHand: 50,
      inTransit: 25,
      packSize: 12,
    },
  ];

  const calculateAllocation = () => {
    // Step 1: Calculate initial state for each warehouse with dynamic forecasts
    const warehousesWithGaps = mockWarehouses.map((wh) => {
      // Calculate this warehouse's forecast based on total forecast × fulfillment %
      const totalFulfillmentPercentages = Object.values(warehouseFulfillmentPercentages).reduce((sum, p) => sum + p, 0);
      const normalizedFulfillmentPercentage = totalFulfillmentPercentages > 0
        ? warehouseFulfillmentPercentages[wh.id] / totalFulfillmentPercentages
        : 0;
      const calculatedForecast = totalDailyForecast * (normalizedFulfillmentPercentage / 100);

      const targetUnits = calculatedForecast * coverageDays;
      const currentInventory = wh.onHand + wh.inTransit;
      const gap = Math.max(0, targetUnits - currentInventory);
      const coverageBefore = calculatedForecast > 0 ? currentInventory / calculatedForecast : 0;

      return {
        ...wh,
        forecast: calculatedForecast, // Override with calculated forecast
        targetUnits,
        gap,
        currentInventory,
        coverageBefore,
        allocatedUnits: 0, // Start with 0 allocated
      };
    });

    let remainingUnits = orderQuantity;

    if (allocationMode === 'manual') {
      // Manual mode: allocate by percentages
      const totalPercentages = Object.values(warehousePercentages).reduce((sum, p) => sum + p, 0);

      warehousesWithGaps.forEach((wh) => {
        const normalizedPercentage = totalPercentages > 0 ? warehousePercentages[wh.id] / totalPercentages : 0;
        const rawAllocation = normalizedPercentage * orderQuantity;

        // Round down to pack size
        wh.allocatedUnits = Math.floor(rawAllocation / wh.packSize) * wh.packSize;
      });

      // Distribute remaining units by remainder
      const totalAllocated = warehousesWithGaps.reduce((sum, wh) => sum + wh.allocatedUnits, 0);
      remainingUnits = orderQuantity - totalAllocated;

      // Calculate remainders and sort
      const withRemainders = warehousesWithGaps.map((wh) => {
        const normalizedPercentage = totalPercentages > 0 ? warehousePercentages[wh.id] / totalPercentages : 0;
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
        // Find warehouse with lowest post-allocation coverage that can accept a pack
        let lowestCoverageWH = null;
        let lowestCoverage = Infinity;

        for (const wh of warehousesWithGaps) {
          // Skip warehouses where we can't add a full pack
          if (remainingUnits < wh.packSize) continue;

          // Calculate coverage if we add this allocation
          const inventoryAfter = wh.currentInventory + wh.allocatedUnits;
          const coverageAfter = wh.forecast > 0 ? inventoryAfter / wh.forecast : Infinity;

          if (coverageAfter < lowestCoverage) {
            lowestCoverage = coverageAfter;
            lowestCoverageWH = wh;
          }
        }

        // If we can't allocate to any warehouse, break
        if (!lowestCoverageWH) break;

        // Allocate one pack to the warehouse with lowest coverage
        lowestCoverageWH.allocatedUnits += lowestCoverageWH.packSize;
        remainingUnits -= lowestCoverageWH.packSize;
      }
    }

    // Calculate final results with coverage metrics
    const finalResults: AllocationResult[] = warehousesWithGaps.map((wh) => {
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

    setResults(finalResults);
  };

  const exportToCSV = () => {
    if (!results) return;

    const headers = [
      'Warehouse',
      'Forecast (units/day)',
      'On Hand',
      'In Transit',
      'Pack Size',
      'Target Units',
      'Gap',
      'Allocated Units',
      'Coverage Before (days)',
      'Coverage After (days)',
    ];

    const rows = results.map((r) => [
      r.name,
      r.forecast,
      r.onHand,
      r.inTransit,
      r.packSize,
      r.targetUnits,
      r.gap,
      r.allocatedUnits,
      r.coverageBefore.toFixed(1),
      r.coverageAfter.toFixed(1),
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `allocation-${sku}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalAllocated = results?.reduce((sum, r) => sum + r.allocatedUnits, 0) || 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Warehouse Allocation</h1>
          <p className="mt-2 text-gray-600">
            Distribute order quantities across warehouses based on forecast, inventory, and coverage targets.
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Allocation Parameters</h2>

          {/* Allocation Mode Toggle */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Allocation Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAllocationMode('auto')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  allocationMode === 'auto'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Auto (Gap-Based)
              </button>
              <button
                onClick={() => setAllocationMode('manual')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  allocationMode === 'manual'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Manual (Percentage-Based)
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {allocationMode === 'auto'
                ? 'Automatically allocates based on inventory gaps and forecasted demand'
                : 'Manually set the distribution percentage for each warehouse'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Quantity</label>
              <input
                type="number"
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Coverage (days)</label>
              <input
                type="number"
                value={coverageDays}
                onChange={(e) => setCoverageDays(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Daily Forecast
                <span className="ml-1 text-xs text-gray-500">(units/day)</span>
              </label>
              <input
                type="number"
                value={totalDailyForecast}
                onChange={(e) => setTotalDailyForecast(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            onClick={calculateAllocation}
            className="mt-4 px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Calculate Allocation
          </button>
        </div>

        {/* Current Warehouse Data */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Warehouse Data</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fulfillment %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Forecast/Day</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">On Hand</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">In Transit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pack Size</th>
                  {allocationMode === 'manual' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Allocation %</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mockWarehouses.map((wh) => {
                  const totalFulfillmentPercentages = Object.values(warehouseFulfillmentPercentages).reduce((sum, p) => sum + p, 0);
                  const normalizedFulfillmentPercentage = totalFulfillmentPercentages > 0
                    ? warehouseFulfillmentPercentages[wh.id] / totalFulfillmentPercentages
                    : 0;
                  const calculatedForecast = totalDailyForecast * (normalizedFulfillmentPercentage / 100);

                  return (
                    <tr key={wh.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{wh.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={warehouseFulfillmentPercentages[wh.id] || 0}
                            onChange={(e) =>
                              setWarehouseFulfillmentPercentages({
                                ...warehouseFulfillmentPercentages,
                                [wh.id]: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-20 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-600">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {calculatedForecast.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{wh.onHand}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{wh.inTransit}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{wh.packSize}</td>
                      {allocationMode === 'manual' && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={warehousePercentages[wh.id] || 0}
                              onChange={(e) =>
                                setWarehousePercentages({
                                  ...warehousePercentages,
                                  [wh.id]: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-20 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-600">%</span>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">Total Fulfillment %:</span>{' '}
              {Object.values(warehouseFulfillmentPercentages).reduce((sum, p) => sum + p, 0).toFixed(1)}%
              {Object.values(warehouseFulfillmentPercentages).reduce((sum, p) => sum + p, 0) !== 100 && (
                <span className="ml-2 text-orange-600">
                  (Percentages will be normalized automatically)
                </span>
              )}
            </p>
            {allocationMode === 'manual' && (
              <p className="text-sm text-gray-700 mt-1">
                <span className="font-semibold">Total Allocation %:</span>{' '}
                {Object.values(warehousePercentages).reduce((sum, p) => sum + p, 0).toFixed(1)}%
              </p>
            )}
          </div>
        </div>

        {/* Results */}
        {results && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Allocation Results</h2>
              <button
                onClick={exportToCSV}
                className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Export CSV
              </button>
            </div>

            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">Total Allocated:</span> {totalAllocated} / {orderQuantity} units
                {totalAllocated !== orderQuantity && (
                  <span className="ml-2 text-orange-600">
                    (Difference: {orderQuantity - totalAllocated} units due to pack size rounding)
                  </span>
                )}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target Units</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gap</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Allocated</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coverage Before</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coverage After</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.map((r) => {
                    const coverageImprovement = r.coverageAfter - r.coverageBefore;
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.targetUnits}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.gap}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-blue-600">{r.allocatedUnits}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {r.coverageBefore.toFixed(1)} days
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="font-medium text-green-600">{r.coverageAfter.toFixed(1)} days</span>
                          <span className="ml-2 text-xs text-gray-500">
                            (+{coverageImprovement.toFixed(1)})
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
