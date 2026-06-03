"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Star, Trash2 } from "lucide-react";
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
  canDelete: boolean;
}

export default function AffiliateDetailClient({
  affiliateId, affiliate, users, customers, affiliatePlatforms, salesData, currentUserId, canDelete,
}: Props) {
  const [showEdit, setShowEdit] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  function handleSaved() {
    setShowEdit(false);
    setShowReview(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`确认删除联盟商「${String(affiliate.platformAffiliateName ?? "")}」？此操作不可恢复。`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/affiliates/${affiliateId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/affiliates?tab=list");
      } else {
        alert("删除失败，请重试");
        setDeleting(false);
      }
    } catch {
      alert("删除失败，请重试");
      setDeleting(false);
    }
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
        {canDelete && (
          <button onClick={handleDelete} disabled={deleting} className="btn-danger flex items-center gap-1.5 text-sm">
            <Trash2 className="h-4 w-4" />{deleting ? "删除中…" : "删除"}
          </button>
        )}
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
