import { queryOptions } from '@tanstack/react-query'
import {
  getBenchmarksAction,
  getTopModelsAction,
  getProvidersAction,
  getLatestTestDateAction,
  getScenariosAction,
  getTestDatesAction,
  getBenchmarkSampleAction,
  getTestSessionsAction,
  getModelScenarioResultsAction,
} from '@/app/actions/benchmarks'

type BenchmarksParams = Parameters<typeof getBenchmarksAction>[0]

export const benchmarkQueries = {
  all: (params?: BenchmarksParams) =>
    queryOptions({
      queryKey: ['benchmarks', 'list', params ?? {}] as const,
      queryFn: () => getBenchmarksAction(params),
    }),

  topModels: () =>
    queryOptions({
      queryKey: ['benchmarks', 'topModels'] as const,
      queryFn: () => getTopModelsAction(),
    }),

  providers: () =>
    queryOptions({
      queryKey: ['benchmarks', 'providers'] as const,
      queryFn: () => getProvidersAction(),
    }),

  latestTestDate: () =>
    queryOptions({
      queryKey: ['benchmarks', 'latestTestDate'] as const,
      queryFn: () => getLatestTestDateAction(),
    }),

  scenarios: () =>
    queryOptions({
      queryKey: ['benchmarks', 'scenarios'] as const,
      queryFn: () => getScenariosAction(),
    }),

  testDates: () =>
    queryOptions({
      queryKey: ['benchmarks', 'testDates'] as const,
      queryFn: () => getTestDatesAction(),
    }),

  sample: (modelSlug: string, scenario?: string) =>
    queryOptions({
      queryKey: ['benchmarks', 'sample', modelSlug, scenario] as const,
      queryFn: () => getBenchmarkSampleAction(modelSlug, scenario),
      enabled: !!modelSlug,
    }),

  testSessions: () =>
    queryOptions({
      queryKey: ['benchmarks', 'testSessions'] as const,
      queryFn: () => getTestSessionsAction(),
    }),

  modelScenarioResults: (modelSlug: string) =>
    queryOptions({
      queryKey: ['benchmarks', 'scenarioResults', modelSlug] as const,
      queryFn: () => getModelScenarioResultsAction(modelSlug),
      enabled: !!modelSlug,
    }),
}
