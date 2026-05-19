"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Star } from "lucide-react";
import AffiliateFormModal from "../AffiliateFormModal";
import CoopReviewModal from "./CoopReviewModal";
import type { SaleRec } from "./AffiliateSalesPanel";

interface Props {
  affiliateId: string;
  affiliate: Record<string, unknown>;
  users: { id: string; name: string }[];
  customers: { id: string; brandName: string; ownerIds: string[] }[];
  affiliatePlatforms: { name: string; link: string | null }[];
  salesData: SaleRec[];
  currentUserId: string;
}

export default function AffiliateDetailClient({
  affiliateId, affiliate, users, customers, affiliatePlatforms, salesData, currentUserId,
}: Props) {
  const [showEdit, setShowEdit] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const router = useRouter();

  function handleSaved() {
    setShowEdit(false);
    setShowReview(false);
    router.refresh();
  }

  // Strip ownerIds for the form modal (only needs id + brandName)
  const formCustomers = customers.map(c => ({ id: c.id, brandName: c.brandName }));

  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setShowEdit(true)} className="btn-outline flex items-center gap-1.5 text-sm">
          <Pencil className="h-4 w-4" />编辑
        </button>
        <button onClick={() => setShowReview(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Star className="h-4 w-4" />合作审核
        </button>
      </div>

      {showEdit && (
        <AffiliateFormModal
          users={users}
          customers={formCustomers}
          currentUserId={currentUserId}
          affiliate={affiliate}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}

      {showReview && (
        <CoopReviewModal
          affiliateId={affiliateId}
          affiliateName={String(affiliate.platformAffiliateName ?? "")}
          customers={customers}
          users={users}
          affiliatePlatforms={affiliatePlatforms}
          salesData={salesData}
          onClose={() => setShowReview(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
