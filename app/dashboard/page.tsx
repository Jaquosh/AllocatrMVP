'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { calculateAllocation as calculateAllocationLogic } from '@/lib/allocation/calculator';
import type { Warehouse as CalculatorWarehouse, AllocationResult as CalculatorResult } from '@/lib/allocation/calculator';

interface Warehouse extends CalculatorWarehouse {
  capacityMax?: number;
  minPresentation?: number;
}

type AllocationResult = CalculatorResult;

// Default warehouse templates
const DEFAULT_WAREHOUSES: Warehouse[] = [
  { id: 'WH-EAST', name: 'East Coast DC', forecast: 15, onHand: 100, inTransit: 50 },
  { id: 'WH-WEST', name: 'West Coast DC', forecast: 25, onHand: 80, inTransit: 0 },
  { id: 'WH-CENTRAL', name: 'Central DC', forecast: 10, onHand: 200, inTransit: 100 },
  { id: 'WH-SOUTH', name: 'Southern DC', forecast: 20, onHand: 50, inTransit: 25 },
];

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [sku, setSku] = useState('SHOE-001');
  const [packSize, setPackSize] = useState(12); // SKU-level pack size
  const [orderQuantity, setOrderQuantity] = useState(1000);
  const [coverageDays, setCoverageDays] = useState(21);
  const [totalDailyForecast, setTotalDailyForecast] = useState(70);
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto');
  const [warehouses, setWarehouses] = useState<Warehouse[]>(DEFAULT_WAREHOUSES);
  const [warehousePercentages, setWarehousePercentages] = useState<Record<string, number>>({
    'WH-EAST': 25,
    'WH-WEST': 25,
    'WH-CENTRAL': 25,
    'WH-SOUTH': 25,
  });
  const [warehouseFulfillmentPercentages, setWarehouseFulfillmentPercentages] = useState<Record<string, number>>({
    'WH-EAST': 21.4,
    'WH-WEST': 35.7,
    'WH-CENTRAL': 14.3,
    'WH-SOUTH': 28.6,
  });
  const [results, setResults] = useState<AllocationResult[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      } else {
        setIsLoading(false);
      }
    };

    checkUser();
  }, [supabase, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  // Warehouse management functions
  const addWarehouse = () => {
    const newId = `WH-${Date.now()}`;
    const newWarehouse: Warehouse = {
      id: newId,
      name: 'New Warehouse',
      forecast: 0,
      onHand: 0,
      inTransit: 0,
    };

    setWarehouses([...warehouses, newWarehouse]);

    // Initialize percentages for new warehouse
    const defaultPercentage = 100 / (warehouses.length + 1);
    setWarehousePercentages({ ...warehousePercentages, [newId]: defaultPercentage });
    setWarehouseFulfillmentPercentages({ ...warehouseFulfillmentPercentages, [newId]: defaultPercentage });
    setEditingWarehouseId(newId);
  };

  const deleteWarehouse = (id: string) => {
    if (warehouses.length <= 1) {
      alert('Cannot delete the last warehouse. At least one warehouse is required.');
      return;
    }

    setWarehouses(warehouses.filter(wh => wh.id !== id));

    // Remove from percentages
    const remainingPercentages = Object.fromEntries(
      Object.entries(warehousePercentages).filter(([key]) => key !== id)
    );
    const remainingFulfillment = Object.fromEntries(
      Object.entries(warehouseFulfillmentPercentages).filter(([key]) => key !== id)
    );
    setWarehousePercentages(remainingPercentages);
    setWarehouseFulfillmentPercentages(remainingFulfillment);
  };

  const updateWarehouseName = (id: string, newName: string) => {
    setWarehouses(warehouses.map(wh =>
      wh.id === id ? { ...wh, name: newName } : wh
    ));
  };

  const updateWarehouseField = (id: string, field: keyof Warehouse, value: number) => {
    setWarehouses(warehouses.map(wh =>
      wh.id === id ? { ...wh, [field]: value } : wh
    ));
  };

  const calculateAllocation = () => {
    // Calculate forecast for each warehouse based on fulfillment %
    const warehousesWithCalculatedForecast = warehouses.map((wh) => {
      const totalFulfillmentPercentages = Object.values(warehouseFulfillmentPercentages).reduce((sum, p) => sum + p, 0);
      const normalizedFulfillmentPercentage = totalFulfillmentPercentages > 0
        ? warehouseFulfillmentPercentages[wh.id] / totalFulfillmentPercentages
        : 0;
      const calculatedForecast = totalDailyForecast * (normalizedFulfillmentPercentage / 100);

      return {
        ...wh,
        forecast: calculatedForecast,
      };
    });

    // Use extracted business logic
    const finalResults = calculateAllocationLogic({
      warehouses: warehousesWithCalculatedForecast,
      orderQuantity,
      coverageDays,
      allocationMode,
      warehousePercentages,
      packSize,
    });

    setResults(finalResults);
  };

  const saveAllocation = async () => {
    if (!results) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const totalAllocated = results.reduce((sum, r) => sum + r.allocatedUnits, 0);

      // Insert the main allocation record
      const { data: allocation, error: allocationError } = await supabase
        .from('allocations')
        .insert({
          user_id: user.id,
          sku,
          order_quantity: orderQuantity,
          coverage_days: coverageDays,
          total_daily_forecast: totalDailyForecast,
          allocation_mode: allocationMode,
          total_allocated: totalAllocated,
        })
        .select()
        .single();

      if (allocationError) throw allocationError;

      // Insert allocation items
      const items = results.map((r) => ({
        allocation_id: allocation.id,
        warehouse_id: r.id,
        warehouse_name: r.name,
        forecast: r.forecast,
        on_hand: r.onHand,
        in_transit: r.inTransit,
        pack_size: r.packSize,
        target_units: r.targetUnits,
        gap: r.gap,
        allocated_units: r.allocatedUnits,
        coverage_before: r.coverageBefore,
        coverage_after: r.coverageAfter,
        fulfillment_percentage: warehouseFulfillmentPercentages[r.id],
        allocation_percentage: allocationMode === 'manual' ? warehousePercentages[r.id] : null,
      }));

      const { error: itemsError } = await supabase
        .from('allocation_items')
        .insert(items);

      if (itemsError) throw itemsError;

      setSaveMessage({ type: 'success', text: 'Allocation saved successfully!' });

      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Error saving allocation:', error);
      setSaveMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save allocation' });
    } finally {
      setSaving(false);
    }
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

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pack Size
                <span className="ml-1 text-xs text-gray-500">(units)</span>
              </label>
              <input
                type="number"
                value={packSize}
                onChange={(e) => setPackSize(parseInt(e.target.value) || 1)}
                min="1"
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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Warehouse Data</h2>
            <button
              onClick={addWarehouse}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              + Add Warehouse
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fulfillment %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Forecast/Day</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">On Hand</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">In Transit</th>
                  {allocationMode === 'manual' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Allocation %</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {warehouses.map((wh) => {
                  const totalFulfillmentPercentages = Object.values(warehouseFulfillmentPercentages).reduce((sum, p) => sum + p, 0);
                  const normalizedFulfillmentPercentage = totalFulfillmentPercentages > 0
                    ? warehouseFulfillmentPercentages[wh.id] / totalFulfillmentPercentages
                    : 0;
                  const calculatedForecast = totalDailyForecast * (normalizedFulfillmentPercentage / 100);
                  const isEditing = editingWarehouseId === wh.id;

                  return (
                    <tr key={wh.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={wh.name}
                            onChange={(e) => updateWarehouseName(wh.id, e.target.value)}
                            onBlur={() => setEditingWarehouseId(null)}
                            onKeyDown={(e) => e.key === 'Enter' && setEditingWarehouseId(null)}
                            autoFocus
                            className="w-full px-2 py-1 border border-blue-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span
                            onClick={() => setEditingWarehouseId(wh.id)}
                            className="cursor-pointer hover:text-blue-600"
                          >
                            {wh.name}
                          </span>
                        )}
                      </td>
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
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          value={wh.onHand}
                          onChange={(e) => updateWarehouseField(wh.id, 'onHand', parseInt(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          value={wh.inTransit}
                          onChange={(e) => updateWarehouseField(wh.id, 'inTransit', parseInt(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
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
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteWarehouse(wh.id)}
                          disabled={warehouses.length <= 1}
                          className="text-red-600 hover:text-red-800 disabled:text-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                        >
                          Delete
                        </button>
                      </td>
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
              <div className="flex gap-2">
                <button
                  onClick={saveAllocation}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Allocation'}
                </button>
                <button
                  onClick={exportToCSV}
                  className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Export CSV
                </button>
              </div>
            </div>

            {saveMessage && (
              <div className={`mb-4 p-4 rounded-md ${
                saveMessage.type === 'success'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}>
                <p className={`text-sm ${
                  saveMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {saveMessage.text}
                </p>
              </div>
            )}

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
