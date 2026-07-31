import React, { useEffect, useState } from 'react';
import SubscriptionStatusCard from './billing/SubscriptionStatusCard.tsx';
import PricingTable from './billing/PricingTable.tsx';
import { Building, Loader2 } from 'lucide-react';

interface SettingsProps {
  token: string | null;
}

export default function Settings({ token }: SettingsProps) {
  const [orgData, setOrgData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrgData = async () => {
      try {
        const response = await fetch('/api/organizations/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setOrgData(data);
        }
      } catch (error) {
        console.error('Error fetching org data', error);
      } finally {
        setLoading(false);
      }
    };
    if (token) {
      fetchOrgData();
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building className="w-6 h-6 text-gray-400" />
            Configuración de la Organización
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona los detalles de tu organización, usuarios y facturación.
          </p>
        </div>
      </div>

      <div className="space-y-12">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Facturación y Planes</h2>
          <div className="mb-8">
            <SubscriptionStatusCard 
              status={orgData?.subscriptionStatus || 'free'} 
              variantId={orgData?.variantId}
              renewsAt={orgData?.renewsAt}
            />
          </div>
          
          <div className="bg-gray-50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-12 border-y border-gray-200">
            <PricingTable />
          </div>
        </section>
      </div>
    </div>
  );
}
