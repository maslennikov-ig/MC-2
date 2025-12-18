'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { regenerateLessonWithRefinement } from '@/app/actions/admin-generation';

interface RefinementModalProps {
  lessonId: string;
  lessonTitle: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function RefinementModal({ lessonId, lessonTitle, trigger, onSuccess }: RefinementModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refinementType, setRefinementType] = useState<'fix' | 'add' | 'simplify' | 'restructure' | 'custom'>('fix');
  const [instructions, setInstructions] = useState('');

  const handleSubmit = async () => {
    if (!instructions.trim()) {
      toast.error('Please provide instructions');
      return;
    }

    try {
      setLoading(true);
      await regenerateLessonWithRefinement(lessonId, refinementType, instructions);
      toast.success('Refinement queued successfully');
      setOpen(false);
      setInstructions('');
      if (onSuccess) onSuccess();
    } catch (error) {
      void error;
      toast.error('Failed to queue refinement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refine
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Refine Lesson: {lessonTitle}</DialogTitle>
          <DialogDescription>
            Provide instructions to regenerate this lesson with specific improvements.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Refinement Type</Label>
            <RadioGroup
              defaultValue="fix"
              value={refinementType}
              onValueChange={(v) => setRefinementType(v as 'fix' | 'add' | 'simplify' | 'restructure' | 'custom')}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="fix" id="fix" className="peer sr-only" />
                <Label
                  htmlFor="fix"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <span className="text-sm font-semibold">Fix Issue</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="add" id="add" className="peer sr-only" />
                <Label
                  htmlFor="add"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <span className="text-sm font-semibold">Add Content</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="simplify" id="simplify" className="peer sr-only" />
                <Label
                  htmlFor="simplify"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <span className="text-sm font-semibold">Simplify</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="custom" id="custom" className="peer sr-only" />
                <Label
                  htmlFor="custom"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <span className="text-sm font-semibold">Custom</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              placeholder="E.g. 'Add more examples about...' or 'Make the tone more professional'"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              'Queueing...'
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Regenerate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
