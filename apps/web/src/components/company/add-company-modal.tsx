'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Plus } from 'lucide-react';

export function AddCompanyModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newIndustry, setNewIndustry] = React.useState('');
  const [newDescription, setNewDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setFormError('Company name is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          industry: newIndustry.trim() || undefined,
          description: newDescription.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create company.');
      }

      setIsOpen(false);
      setNewName('');
      setNewIndustry('');
      setNewDescription('');

      if (data.slug) {
        router.push(`/companies/${data.slug}`);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#FF7102] hover:bg-[#ff8a3a] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(255,113,2,0.25)] transition-all cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add Company</span>
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add Portfolio Company"
        description="Register a new company into the MIS Intelligence Dashboard."
        maxWidth="md"
      >
        <form onSubmit={handleAddCompany} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 rounded-xl border border-[#FECDCA] dark:border-[#B42318]/40 bg-[#FEF3F2] dark:bg-[#341618] text-[#B42318] dark:text-[#F87171] text-xs">
              {formError}
            </div>
          )}

          <Input
            label="Company Name"
            id="new-company-name"
            required
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Acme Health"
            disabled={isSubmitting}
          />

          <Input
            label="Industry / Sector"
            id="new-company-industry"
            value={newIndustry}
            onChange={(e) => setNewIndustry(e.target.value)}
            placeholder="e.g. HealthTech, D2C, FinTech"
            disabled={isSubmitting}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="new-company-desc"
              className="block text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono"
            >
              Description (Optional)
            </label>
            <textarea
              id="new-company-desc"
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Brief summary of core product and business model…"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] px-3 py-2 text-xs text-[#1A1815] dark:text-[#FAFAF8] placeholder:text-[#9A958E] focus:outline-none focus:border-[#FF7102]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E5DE] dark:border-[#2E2A24]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
              className="text-xs rounded-xl"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-xl bg-[#FF7102] hover:bg-[#ff8a3a] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Creating…' : 'Create Company'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
