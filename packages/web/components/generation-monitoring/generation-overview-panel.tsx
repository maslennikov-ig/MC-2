'use client';

import { useGenerationRealtime } from './realtime-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrainCircuit, Coins, Timer, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export function GenerationOverviewPanel() {
  const { traces, status } = useGenerationRealtime();

  // Aggregates
  const totalCost = traces.reduce((acc, t) => acc + (t.cost_usd || 0), 0);
  const totalTokens = traces.reduce((acc, t) => acc + (t.tokens_used || 0), 0);
  const startTime = traces.length > 0 
    ? new Date(Math.min(...traces.map(t => new Date(t.created_at).getTime()))) 
    : null;
  
  const duration = startTime ? Math.floor((Date.now() - startTime.getTime()) / 1000) : 0;
  const durationFormatted = `${Math.floor(duration / 60)}m ${duration % 60}s`;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{status || 'Unknown'}</div>
            <p className="text-xs text-muted-foreground">
              Current pipeline state
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground">
              Cumulative LLM cost
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
            <BrainCircuit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Total tokens processed
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{durationFormatted}</div>
            <p className="text-xs text-muted-foreground">
              Since first activity
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}