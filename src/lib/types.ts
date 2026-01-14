export type WorkOrderStatus = "open" | "in progress" | "closed";

export interface WorkOrder {
  id: number;                // invoice #
  status: WorkOrderStatus;
  assignedTo?: string;
  checkInAt: string;         // ISO
  lastName: string;
  firstName: string;
  phone?: string;
  total: number;
  balance: number;
  summary: string;
  // store removed – single-location deployment
  repairDate?: string | null;
}

// export type WorkOrderStore = 'Devine Street' | 'Forest Acres' | 'Online' | 'Other'; // unused

export interface WorkOrderItem {
  id: string;
  status: "pending" | "done";
  description: string;
  qty?: number;
  unitPrice?: number;
}

export interface WorkOrderFull {
  id: number;
  status: WorkOrderStatus;
  assignedTo?: string | null;
  customerId: number;
  checkInAt: string;
  repairCompletionDate?: string | null;
  checkoutDate?: string | null;

  productCategory: string;
  productDescription: string;
  problemInfo?: string;
  password?: string;
  patternSequence?: number[];
  model?: string;
  serial?: string;

  intakeSource?: string;

  // Parts ordering tracking (internal only; exclude from printouts)
  partsOrdered?: boolean;
  partsEstimatedDelivery?: string | null; // ISO date string (YYYY-MM-DD or full ISO)
  partsDates?: string;           // freeform dates/notes string
  partsOrderUrl?: string;        // order link or supplier URL
  partsOrderDate?: string | null;   // ISO date (YYYY-MM-DD)
  partsEstDelivery?: string | null; // ISO date (YYYY-MM-DD)

  quotedPrice?: number;
  discount: number; // absolute discount applied to labor only
  discountType?: 'pct_5' | 'pct_10' | 'custom_pct' | 'custom_amt';
  discountPctValue?: number; // for custom_pct (e.g. 17 for 17%)
  discountCustomAmount?: number; // for custom_amt original input reference
  amountPaid: number;
  paymentType?: "Cash" | "Card" | "Apple Pay" | "Google Pay" | "Other" | string;
  payments?: Array<{ amount: number; paymentType: string; at: string }>;
  taxRate: number;

  laborCost: number;
  partCosts: number;

  totals: {
    subTotal: number;
    tax: number;
    total: number;
    remaining: number;
  };

  items: WorkOrderItem[];
  internalNotes?: string;
}

export interface Customer {
  id: number;
  firstName: string;
  middleInitial?: string;
  lastName: string;
  email?: string;
  phone?: string;
  phoneAlt?: string;
  zip?: string;
  notes?: string;
  // store removed – single-location deployment
  createdAt: string;
  updatedAt: string;
}

export interface Technician {
  id: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  phone?: string;
  email?: string;
  active?: boolean;
}

export interface RepairItem {
  id: string;
  category: string;
  title: string;           // Product / Service
  altDescription?: string;
  partCost: number;
  laborCost: number;
  // Internal cost for reporting/analytics only; not shown in work order UI
  internalCost?: number;
  orderDate?: string;      // ISO
  estDelivery?: string;    // ISO
  partSource?: string;
  orderSourceUrl?: string;
  type: "product" | "service";
  model?: string;
}
