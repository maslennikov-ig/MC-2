/**
 * ModelSelector Component (T033)
 *
 * Searchable combobox for selecting OpenRouter models.
 * Includes filters for provider, context size, and price.
 *
 * @module app/admin/pipeline/components/model-selector
 */

'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listOpenRouterModels } from '@/app/actions/pipeline-admin';
import type { OpenRouterModel } from '@megacampus/shared-types';

interface ModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Searchable model selector with filters
 *
 * Features:
 * - Text search across model ID, name, and description
 * - Provider filter dropdown
 * - Context size range inputs
 * - Price range filter
 * - Displays model details: name, provider, context size, pricing
 *
 * Uses Command + Popover pattern from shadcn/ui.
 */
export function ModelSelector({ value, onValueChange, label, placeholder }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [filteredModels, setFilteredModels] = useState<OpenRouterModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter state
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [minContext, setMinContext] = useState('');
  const [maxContext, setMaxContext] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Load models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        setIsLoading(true);
        const result = await listOpenRouterModels();
        const modelsList = result.result?.data?.models || [];
        setModels(modelsList);
        setFilteredModels(modelsList);
      } catch (error) {
        console.error('Failed to load models:', error);
        setModels([]);
        setFilteredModels([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadModels();
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = [...models];

    // Provider filter
    if (selectedProvider !== 'all') {
      filtered = filtered.filter((m) => m.provider === selectedProvider);
    }

    // Context size filters
    if (minContext) {
      const min = parseInt(minContext, 10);
      if (!isNaN(min)) {
        filtered = filtered.filter((m) => m.contextLength >= min);
      }
    }
    if (maxContext) {
      const max = parseInt(maxContext, 10);
      if (!isNaN(max)) {
        filtered = filtered.filter((m) => m.contextLength <= max);
      }
    }

    // Price filter (average per million tokens)
    if (maxPrice) {
      const maxPriceNum = parseFloat(maxPrice);
      if (!isNaN(maxPriceNum)) {
        filtered = filtered.filter((m) => {
          const avgPrice = ((m.pricing.prompt + m.pricing.completion) / 2) * 1_000_000;
          return avgPrice <= maxPriceNum;
        });
      }
    }

    // Search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.id.toLowerCase().includes(query) ||
          m.name.toLowerCase().includes(query) ||
          (m.description && m.description.toLowerCase().includes(query))
      );
    }

    setFilteredModels(filtered);
  }, [models, selectedProvider, minContext, maxContext, maxPrice, searchQuery]);

  // Get unique providers
  const providers = Array.from(new Set(models.map((m) => m.provider))).sort();

  // Find selected model for display
  const selectedModel = models.find((m) => m.id === value);

  return (
    <div className="space-y-2">
      {label && <Label className="text-[rgb(248,250,252)] font-medium">{label}</Label>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-[rgb(30,41,59)] border-[rgba(148,163,184,0.2)] text-[rgb(248,250,252)] hover:bg-[rgb(17,24,39)] hover:border-[rgba(6,182,212,0.3)]"
          >
            {selectedModel ? (
              <span className="truncate">
                {selectedModel.name} ({selectedModel.provider})
              </span>
            ) : (
              <span className="text-[rgb(100,116,139)]">{placeholder || 'Select model...'}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[600px] p-0 bg-[rgb(17,24,39)] border-[rgba(148,163,184,0.2)] shadow-2xl" align="start">
          {/* Filters */}
          <div className="border-b border-[rgba(148,163,184,0.2)] p-3 space-y-2 bg-[rgb(30,41,59)]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-[rgb(203,213,225)] font-medium">Provider</Label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger className="h-8 bg-[rgb(17,24,39)] border-[rgba(148,163,184,0.2)] text-[rgb(248,250,252)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[rgb(17,24,39)] border-[rgba(148,163,184,0.2)]">
                    <SelectItem value="all" className="text-[rgb(248,250,252)] hover:bg-[rgb(30,41,59)]">All Providers</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider} value={provider} className="text-[rgb(248,250,252)] hover:bg-[rgb(30,41,59)]">
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-[rgb(203,213,225)] font-medium">Max Price ($/M tokens)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 10"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="h-8 bg-[rgb(17,24,39)] border-[rgba(148,163,184,0.2)] text-[rgb(248,250,252)] placeholder:text-[rgb(100,116,139)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-[rgb(203,213,225)] font-medium">Min Context</Label>
                <Input
                  type="number"
                  placeholder="e.g., 32000"
                  value={minContext}
                  onChange={(e) => setMinContext(e.target.value)}
                  className="h-8 bg-[rgb(17,24,39)] border-[rgba(148,163,184,0.2)] text-[rgb(248,250,252)] placeholder:text-[rgb(100,116,139)]"
                />
              </div>
              <div>
                <Label className="text-xs text-[rgb(203,213,225)] font-medium">Max Context</Label>
                <Input
                  type="number"
                  placeholder="e.g., 200000"
                  value={maxContext}
                  onChange={(e) => setMaxContext(e.target.value)}
                  className="h-8 bg-[rgb(17,24,39)] border-[rgba(148,163,184,0.2)] text-[rgb(248,250,252)] placeholder:text-[rgb(100,116,139)]"
                />
              </div>
            </div>
          </div>

          {/* Model list */}
          <Command className="bg-[rgb(17,24,39)] border-none">
            <CommandInput
              placeholder="Search models..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="bg-[rgb(17,24,39)] text-[rgb(248,250,252)] placeholder:text-[rgb(100,116,139)] border-none"
            />
            <CommandEmpty className="text-[rgb(203,213,225)] py-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-[rgb(6,182,212)]" />
                  <span className="ml-2 text-[rgb(203,213,225)]">Loading models...</span>
                </div>
              ) : (
                'No models found.'
              )}
            </CommandEmpty>
            <CommandGroup className="max-h-[300px] overflow-auto">
              {filteredModels.map((model) => {
                const avgPrice = ((model.pricing.prompt + model.pricing.completion) / 2) * 1_000_000;

                return (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => {
                      // Use model.id directly, not currentValue (which may be lowercased by Command)
                      onValueChange(model.id === value ? '' : model.id);
                      setOpen(false);
                    }}
                    className="flex items-start gap-2 py-2 text-[rgb(248,250,252)] hover:bg-[rgb(30,41,59)] hover:border-l-2 hover:border-[rgb(6,182,212)] transition-all cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0 text-[rgb(6,182,212)]',
                        value === model.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-[rgb(248,250,252)]">{model.name}</div>
                      <div className="text-xs text-[rgb(100,116,139)] truncate">{model.id}</div>
                      <div className="flex gap-3 text-xs text-[rgb(203,213,225)] mt-1">
                        <span>{model.provider}</span>
                        <span>{(model.contextLength / 1000).toFixed(0)}K context</span>
                        <span className="text-[rgb(251,191,36)]">${avgPrice.toFixed(2)}/M</span>
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected model details */}
      {selectedModel && (
        <div className="text-xs text-[rgb(203,213,225)] space-y-1 p-2 rounded-md border border-[rgba(148,163,184,0.2)] bg-[rgb(30,41,59)]">
          <div>
            <span className="font-medium text-[rgb(248,250,252)]">ID:</span> {selectedModel.id}
          </div>
          <div>
            <span className="font-medium text-[rgb(248,250,252)]">Context:</span> {selectedModel.contextLength.toLocaleString()} tokens
          </div>
          <div>
            <span className="font-medium text-[rgb(248,250,252)]">Pricing:</span> ${(selectedModel.pricing.prompt * 1_000_000).toFixed(2)}/M prompt, $
            {(selectedModel.pricing.completion * 1_000_000).toFixed(2)}/M completion
          </div>
          {selectedModel.description && (
            <div>
              <span className="font-medium text-[rgb(248,250,252)]">Description:</span> {selectedModel.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
