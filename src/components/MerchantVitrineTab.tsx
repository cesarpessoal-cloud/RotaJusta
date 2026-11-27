import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  Store,
  Trash2,
} from 'lucide-react';
import { resolvePortoAlegreCoordinates } from '../constants/portoAlegre';
import {
  MerchantStorefrontConfig,
  Profile,
  StoreProduct,
  VehicleType,
} from '../types';
import {
  formatFullAddressLine,
  parseFullAddressLine,
  StructuredAddressValue,
} from '../utils/addressLookup';
import { compressImageToJpeg } from '../utils/imageCompression';
import { formatBRL } from '../utils/pricing';
import { buildWhatsAppUrl } from '../utils/quickNotice';
import {
  buildStorefrontUrl,
  formatShortVehicleLabel,
  isSafeImageUrl,
  STOREFRONT_VEHICLE_OPTIONS,
} from '../utils/storefront';
import { AddressAutocompleteFields } from './AddressAutocompleteFields';

interface MerchantVitrineTabProps {
  merchant: Profile;
  onSaveStorefront: (params: {
    profileId: string;
    storefront: MerchantStorefrontConfig;
    storePixKey?: string;
  }) => Promise<Profile>;
  onUpsertStoreProduct?: (params: {
    profileId: string;
    product: StoreProduct;
    storefrontMeta?: MerchantStorefrontConfig;
    storePixKey?: string;
  }) => Promise<StoreProduct>;
  onToggleStoreProductActive?: (params: {
    profileId: string;
    productId: string;
    isActive: boolean;
  }) => Promise<StoreProduct>;
  onDeleteStoreProduct?: (params: {
    profileId: string;
    productId: string;
  }) => Promise<void>;
  onPreviewStorefront?: (merchantId: string) => void;
}

function parsePriceInput(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return 0;
  // Handle Brazilian formatting (e.g. "1.250,90" or "49,90")
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const val = Number(normalized);
    return Number.isFinite(val) ? Math.max(0, Number(val.toFixed(2))) : 0;
  }
  const val = Number(cleaned);
  return Number.isFinite(val) ? Math.max(0, Number(val.toFixed(2))) : 0;
}

export function MerchantVitrineTab({
  merchant,
  onSaveStorefront,
  onUpsertStoreProduct,
  onToggleStoreProductActive,
  onDeleteStoreProduct,
  onPreviewStorefront,
}: MerchantVitrineTabProps) {
  const existingStorefront = merchant.storefront;

  const [storeName, setStoreName] = useState<string>(
    existingStorefront?.storeName ||
      merchant.businessName ||
      merchant.name ||
      'Minha Loja Local'
  );
  const [storeDescription, setStoreDescription] = useState<string>(
    existingStorefront?.storeDescription || ''
  );
  const [storePixKey, setStorePixKey] = useState<string>(merchant.pixKey || '');
  const [storeAddr, setStoreAddr] = useState<StructuredAddressValue>(() => {
    const parsed = parseFullAddressLine(
      existingStorefront?.storeAddress ||
        merchant.address ||
        'Rua dos Andradas, 1234',
      existingStorefront?.storeNeighborhood ||
        merchant.neighborhood ||
        'Centro Histórico'
    );
    return {
      ...parsed,
      cep: existingStorefront?.storeCep || parsed.cep,
      lat: existingStorefront?.storeLat,
      lng: existingStorefront?.storeLng,
    };
  });

  const [products, setProducts] = useState<StoreProduct[]>(
    existingStorefront?.products || []
  );

  useEffect(() => {
    const sf = merchant.storefront;
    setStoreName(
      sf?.storeName || merchant.businessName || merchant.name || 'Minha Loja Local'
    );
    setStoreDescription(sf?.storeDescription || '');
    setStorePixKey(merchant.pixKey || '');
    const parsed = parseFullAddressLine(
      sf?.storeAddress || merchant.address || 'Rua dos Andradas, 1234',
      sf?.storeNeighborhood || merchant.neighborhood || 'Centro Histórico'
    );
    setStoreAddr({
      ...parsed,
      cep: sf?.storeCep || parsed.cep,
      lat: sf?.storeLat,
      lng: sf?.storeLng,
    });
    setProducts(sf?.products || []);
  }, [
    merchant.id,
    merchant.name,
    merchant.businessName,
    merchant.pixKey,
    merchant.address,
    merchant.neighborhood,
    merchant.storefront,
  ]);

  // Product Form State
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [productPriceStr, setProductPriceStr] = useState('');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productVehicle, setProductVehicle] = useState<VehicleType>('Moto');
  const [productActive, setProductActive] = useState<boolean>(true);
  const [isCompressingImg, setIsCompressingImg] = useState(false);

  const [isProductFormOpen, setIsProductFormOpen] = useState(true);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [isSavingStore, setIsSavingStore] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const publicStoreUrl = useMemo(
    () => buildStorefrontUrl(merchant.id),
    [merchant.id]
  );

  const activeProductsCount = useMemo(
    () => products.filter((p) => p.active).length,
    [products]
  );

  const buildCurrentConfig = (
    overrideProducts?: StoreProduct[]
  ): MerchantStorefrontConfig => {
    const formattedAddress =
      formatFullAddressLine(storeAddr) || 'Rua dos Andradas, 1234';
    const nb = storeAddr.neighborhood.trim() || 'Centro Histórico';
    const coords =
      storeAddr.lat !== undefined && storeAddr.lng !== undefined
        ? { lat: storeAddr.lat, lng: storeAddr.lng }
        : resolvePortoAlegreCoordinates(formattedAddress, nb, 0);

    return {
      storeName: storeName.trim() || merchant.businessName || merchant.name,
      storeDescription: storeDescription.trim() || undefined,
      storeCep: storeAddr.cep.trim() || undefined,
      storeAddress: formattedAddress,
      storeNeighborhood: nb,
      storeLat: coords.lat,
      storeLng: coords.lng,
      products: overrideProducts ?? products,
    };
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMsg(null);
    if (!storeName.trim()) {
      setFeedbackMsg({
        type: 'err',
        text: 'Informe o nome exibido na sua vitrine pública.',
      });
      return;
    }
    if (!storeAddr.street.trim()) {
      setFeedbackMsg({
        type: 'err',
        text: 'Informe a rua/endereço de retirada da loja para o cálculo de frete.',
      });
      return;
    }

    setIsSavingStore(true);
    try {
      const nextConfig = buildCurrentConfig([]);
      await onSaveStorefront({
        profileId: merchant.id,
        storefront: nextConfig,
        storePixKey: storePixKey.trim(),
      });
      setFeedbackMsg({
        type: 'ok',
        text: 'Dados da loja, endereço de retirada e chave Pix salvos na vitrine!',
      });
    } catch (err) {
      setFeedbackMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Erro ao salvar configurações da vitrine.',
      });
    } finally {
      setIsSavingStore(false);
    }
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setProductName('');
    setProductDesc('');
    setProductPriceStr('');
    setProductImageUrl('');
    setProductVehicle('Moto');
    setProductActive(true);
  };

  const handleProductPhotoUpload = async (file: File | undefined) => {
    if (!file) return;
    setIsCompressingImg(true);
    setFeedbackMsg(null);
    try {
      const dataUrl = await compressImageToJpeg(file, 480, 0.65);
      setProductImageUrl(dataUrl);
    } catch (err) {
      setFeedbackMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Não foi possível processar a foto do produto.',
      });
    } finally {
      setIsCompressingImg(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMsg(null);

    const trimmedName = productName.trim();
    const parsedPrice = parsePriceInput(productPriceStr);

    if (!trimmedName) {
      setFeedbackMsg({
        type: 'err',
        text: 'Informe o nome do produto.',
      });
      return;
    }
    if (parsedPrice <= 0) {
      setFeedbackMsg({
        type: 'err',
        text: 'Informe um preço válido maior que R$ 0,00.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const existingTarget = editingProductId
      ? products.find((p) => p.id === editingProductId)
      : undefined;

    const targetProduct: StoreProduct = existingTarget
      ? {
          ...existingTarget,
          profileId: merchant.id,
          name: trimmedName,
          description: productDesc.trim(),
          price: parsedPrice,
          imageUrl: productImageUrl.trim() || undefined,
          recommendedVehicle: productVehicle,
          active: productActive,
          updatedAt: nowIso,
        }
      : {
          id: crypto.randomUUID(),
          profileId: merchant.id,
          name: trimmedName,
          description: productDesc.trim(),
          price: parsedPrice,
          imageUrl: productImageUrl.trim() || undefined,
          recommendedVehicle: productVehicle,
          active: productActive,
          createdAt: nowIso,
        };

    setIsSavingProduct(true);
    try {
      let savedProduct = targetProduct;
      if (onUpsertStoreProduct) {
        savedProduct = await onUpsertStoreProduct({
          profileId: merchant.id,
          product: targetProduct,
          storefrontMeta: buildCurrentConfig([]),
          storePixKey: storePixKey.trim(),
        });
      } else {
        const nextProductsFallback = editingProductId
          ? products.map((p) => (p.id === editingProductId ? targetProduct : p))
          : [targetProduct, ...products];
        await onSaveStorefront({
          profileId: merchant.id,
          storefront: buildCurrentConfig(nextProductsFallback),
          storePixKey: storePixKey.trim(),
        });
      }

      const nextProducts = editingProductId
        ? products.map((p) => (p.id === editingProductId ? savedProduct : p))
        : [savedProduct, ...products];
      setProducts(nextProducts);
      resetProductForm();
      setFeedbackMsg({
        type: 'ok',
        text: editingProductId
          ? 'Produto atualizado na tabela de produtos!'
          : 'Produto adicionado e publicado na vitrine!',
      });
    } catch (err) {
      setFeedbackMsg({
        type: 'err',
        text:
          err instanceof Error ? err.message : 'Erro ao salvar produto no banco.',
      });
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleToggleProductActive = async (productId: string) => {
    setFeedbackMsg(null);
    const currentProduct = products.find((p) => p.id === productId);
    if (!currentProduct) return;
    const nextIsActive = !currentProduct.active;
    const nextProducts = products.map((p) =>
      p.id === productId
        ? { ...p, active: nextIsActive, updatedAt: new Date().toISOString() }
        : p
    );
    try {
      if (onToggleStoreProductActive) {
        await onToggleStoreProductActive({
          profileId: merchant.id,
          productId,
          isActive: nextIsActive,
        });
      } else {
        await onSaveStorefront({
          profileId: merchant.id,
          storefront: buildCurrentConfig(nextProducts),
        });
      }
      setProducts(nextProducts);
    } catch (err) {
      setFeedbackMsg({
        type: 'err',
        text:
          err instanceof Error ? err.message : 'Erro ao alterar status do item.',
      });
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    setFeedbackMsg(null);
    const nextProducts = products.filter((p) => p.id !== productId);
    try {
      if (onDeleteStoreProduct) {
        await onDeleteStoreProduct({
          profileId: merchant.id,
          productId,
        });
      } else {
        await onSaveStorefront({
          profileId: merchant.id,
          storefront: buildCurrentConfig(nextProducts),
        });
      }
      setProducts(nextProducts);
      if (editingProductId === productId) {
        resetProductForm();
      }
    } catch (err) {
      setFeedbackMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover produto.',
      });
    }
  };

  const handleStartEdit = (product: StoreProduct) => {
    setEditingProductId(product.id);
    setProductName(product.name);
    setProductDesc(product.description);
    setProductPriceStr(product.price.toFixed(2).replace('.', ','));
    setProductImageUrl(product.imageUrl || '');
    setProductVehicle(product.recommendedVehicle);
    setProductActive(product.active);
    setIsProductFormOpen(true);
    setFeedbackMsg(null);
    window.setTimeout(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      nameInputRef.current?.focus();
    }, 50);
  };

  const handleOpenNewProductForm = () => {
    resetProductForm();
    setIsProductFormOpen(true);
    setFeedbackMsg(null);
    window.setTimeout(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      nameInputRef.current?.focus();
    }, 50);
  };

  const handleCopyStoreLink = async () => {
    try {
      await navigator.clipboard.writeText(publicStoreUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const shareWhatsAppUrl = buildWhatsAppUrl({
    message: `Olá! Confira os produtos da nossa loja *${
      storeName.trim() || merchant.businessName || merchant.name
    }* no RotaJusta e peça com entrega calculada na hora para Porto Alegre:\n${publicStoreUrl}`,
  });

  return (
    <div className="space-y-6">
      {/* Barra de Ações em Destaque logo no Topo da Tela */}
      <section className="rounded-2xl border-2 border-emerald-200 bg-white p-4 sm:p-5 shadow-xs flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shrink-0">
            <Store className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
            <h2 className="font-display text-lg font-bold text-zinc-950">
              Minha Vitrine / Catálogo de Produtos
            </h2>
            <p className="text-xs text-zinc-600">
              <strong className="font-mono font-bold text-zinc-900 tabular-nums">
                {activeProductsCount} ativo(s)
              </strong>{' '}
              de {products.length} item(ns) · Seus clientes escolhem no link da
              loja com cálculo automático de frete e Pix.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenNewProductForm}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 whitespace-nowrap"
          >
            <span>+ Cadastrar Novo Produto</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyStoreLink()}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border-2 border-zinc-900 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-zinc-900 transition-colors hover:bg-zinc-100 whitespace-nowrap"
          >
            {copiedLink ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span>Link da Vitrine Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>Copiar Link Público da Vitrine</span>
              </>
            )}
          </button>

          {onPreviewStorefront && (
            <button
              type="button"
              onClick={() => onPreviewStorefront(merchant.id)}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span>Visualizar Loja</span>
            </button>
          )}
        </div>
      </section>

      {feedbackMsg && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            feedbackMsg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Formulário Simples de Cadastro / Edição de Produto (Logo no topo) */}
      {isProductFormOpen && (
        <section
          ref={formSectionRef}
          className="scroll-mt-24 rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-zinc-900">
                {editingProductId
                  ? 'Editar Produto da Vitrine'
                  : 'Cadastrar Novo Produto'}
              </h3>
              <p className="text-xs text-zinc-500">
                Informe nome, preço, foto, descrição curta e o modal de entrega
                recomendado para o cálculo automático de frete.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingProductId && (
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar Edição
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsProductFormOpen(false)}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Recolher Formulário
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleProductSubmit(e)}
            className="grid grid-cols-1 gap-4 lg:grid-cols-12"
          >
            <div className="lg:col-span-8 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-8">
                  <label
                    htmlFor="prod-name"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Nome do Produto
                  </label>
                  <input
                    ref={nameInputRef}
                    id="prod-name"
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ex: Combo Café Especial + 2 Croissants"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label
                    htmlFor="prod-price"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Preço (R$)
                  </label>
                  <input
                    id="prod-price"
                    type="text"
                    inputMode="decimal"
                    value={productPriceStr}
                    onChange={(e) => setProductPriceStr(e.target.value)}
                    placeholder="49,90"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm font-semibold text-zinc-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="prod-desc"
                  className="block text-xs font-semibold text-zinc-700 mb-1"
                >
                  Descrição Curta
                </label>
                <input
                  id="prod-desc"
                  type="text"
                  maxLength={140}
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  placeholder="Ex: Pacote 250g torra média + 2 croissants amanteigados frescos"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-zinc-700">
                  Modal de Entrega Recomendado
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STOREFRONT_VEHICLE_OPTIONS.map((opt) => {
                    const selected = productVehicle === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setProductVehicle(opt.value)}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          selected
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <span className="block text-xs font-bold">
                          {opt.shortLabel}
                        </span>
                        <span className="block text-[10px] text-zinc-500 leading-tight mt-0.5">
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productActive}
                    onChange={(e) => setProductActive(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>Produto ativo e visível na loja pública</span>
                </label>

                <button
                  type="submit"
                  disabled={isSavingProduct || isCompressingImg}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isSavingProduct
                      ? 'Salvando...'
                      : editingProductId
                      ? 'Salvar Alterações'
                      : 'Salvar e Publicar Produto'}
                  </span>
                </button>
              </div>
            </div>

            {/* Foto / Imagem do Produto */}
            <div className="lg:col-span-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
              <span className="block text-xs font-semibold text-zinc-800">
                Foto ou Imagem do Produto
              </span>

              <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-200 bg-white flex items-center justify-center">
                {isSafeImageUrl(productImageUrl) ? (
                  <img
                    src={productImageUrl}
                    alt={productName || 'Prévia do produto'}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-zinc-400 p-4 text-center">
                    <ImageIcon className="h-8 w-8" aria-hidden="true" />
                    <span className="text-[11px]">
                      Envie uma foto ou informe uma URL abaixo
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="min-h-[38px] flex-1 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 whitespace-nowrap">
                  <Camera className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>
                    {isCompressingImg
                      ? 'Processando...'
                      : productImageUrl
                      ? 'Trocar Foto'
                      : 'Enviar Foto'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void handleProductPhotoUpload(file);
                      e.target.value = '';
                    }}
                  />
                </label>

                {productImageUrl && (
                  <button
                    type="button"
                    onClick={() => setProductImageUrl('')}
                    className="min-h-[38px] rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                )}
              </div>

              <div>
                <label
                  htmlFor="prod-img-url"
                  className="block text-[11px] font-medium text-zinc-600 mb-1"
                >
                  Ou cole a URL da imagem (opcional)
                </label>
                <input
                  id="prod-img-url"
                  type="url"
                  value={productImageUrl.startsWith('data:') ? '' : productImageUrl}
                  onChange={(e) => setProductImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Lista de Produtos Cadastrados */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-zinc-900">
            Produtos da Vitrine ({products.length})
          </h2>
          <span className="text-xs text-zinc-500 tabular-nums">
            {activeProductsCount} ativo(s) · {products.length - activeProductsCount}{' '}
            pausado(s)
          </span>
        </div>

        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-zinc-900">
              Sua vitrine ainda não tem produtos cadastrados
            </p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Use o formulário acima para adicionar seus primeiros itens com foto,
              preço e categoria de veículo recomendada.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <article
                key={product.id}
                className={`flex flex-col justify-between rounded-xl border bg-white overflow-hidden transition-opacity ${
                  product.active
                    ? 'border-zinc-200'
                    : 'border-zinc-200 bg-zinc-50/70 opacity-80'
                }`}
              >
                <div>
                  <div className="aspect-[4/3] w-full bg-zinc-100 overflow-hidden">
                    {isSafeImageUrl(product.imageUrl) ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 text-zinc-400">
                        <Store className="h-7 w-7" aria-hidden="true" />
                        <span className="text-[11px] font-medium">
                          {product.name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>
                        Entrega: {formatShortVehicleLabel(product.recommendedVehicle)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          product.active
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-amber-700'
                        }
                      >
                        {product.active ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>

                    <h3 className="font-display text-sm sm:text-base font-bold text-zinc-900 leading-snug">
                      {product.name}
                    </h3>

                    {product.description && (
                      <p className="text-xs text-zinc-600 line-clamp-2">
                        {product.description}
                      </p>
                    )}

                    <p className="pt-1 font-mono text-base font-bold text-zinc-950 tabular-nums">
                      {formatBRL(product.price)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-zinc-100 px-4 py-3 bg-zinc-50/50">
                  <button
                    type="button"
                    onClick={() => void handleToggleProductActive(product.id)}
                    className={`min-h-[36px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                      product.active
                        ? 'border-amber-300 bg-white text-amber-800 hover:bg-amber-50'
                        : 'border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {product.active ? (
                      <>
                        <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Pausar</span>
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Ativar</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartEdit(product)}
                    className="min-h-[36px] inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 whitespace-nowrap"
                  >
                    <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Editar</span>
                  </button>

                  <button
                    type="button"
                    aria-label={`Excluir ${product.name}`}
                    onClick={() => void handleDeleteProduct(product.id)}
                    className="min-h-[36px] inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Link Público Compartilhável + Dados da Loja */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-5 rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white shrink-0">
              <Store className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
              <h2 className="font-display text-base font-bold text-zinc-900">
                Link Público &amp; Compartilhamento
              </h2>
              <p className="text-xs text-zinc-600">
                Compartilhe no Instagram, WhatsApp ou Google. Clientes escolhem
                itens, calculam o frete por CEP e pagam via Pix.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
            <span className="block text-[11px] font-medium text-zinc-500">
              Endereço público da vitrine
            </span>
            <p className="font-mono text-xs text-zinc-800 break-all select-all">
              {publicStoreUrl}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCopyStoreLink()}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
            >
              {copiedLink ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Link Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copiar Link Público da Vitrine</span>
                </>
              )}
            </button>

            <a
              href={shareWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-700 whitespace-nowrap"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Compartilhar no WhatsApp</span>
            </a>

            <a
              href={publicStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Abrir em Nova Aba</span>
            </a>
          </div>
        </div>

        {/* Configurações da Loja: Nome, Descrição, Pix e Endereço de Retirada */}
        <form
          onSubmit={(e) => void handleSaveStoreSettings(e)}
          className="lg:col-span-7 rounded-xl border border-zinc-200 bg-white p-5 space-y-4"
        >
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="font-display text-base font-bold text-zinc-900">
              Identidade, Pix e Endereço de Retirada da Loja
            </h2>
            <p className="text-xs text-zinc-500">
              Usado para gerar pedidos #RS-XXXX com cálculo real de frete a partir
              da sua loja e QR Code Pix no checkout.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="vitrine-store-name"
                className="block text-xs font-semibold text-zinc-700 mb-1"
              >
                Nome da Loja na Vitrine
              </label>
              <input
                id="vitrine-store-name"
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex: Padaria Bom Fim"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="vitrine-store-pix"
                className="block text-xs font-semibold text-zinc-700 mb-1"
              >
                Chave Pix da Loja (para receber pedidos)
              </label>
              <div className="relative">
                <QrCode
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  id="vitrine-store-pix"
                  type="text"
                  value={storePixKey}
                  onChange={(e) => setStorePixKey(e.target.value)}
                  placeholder="CNPJ, telefone, e-mail ou chave aleatória"
                  className="w-full rounded-lg border border-zinc-300 bg-white pl-8 pr-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="vitrine-store-desc"
              className="block text-xs font-semibold text-zinc-700 mb-1"
            >
              Descrição curta da loja (opcional)
            </label>
            <input
              id="vitrine-store-desc"
              type="text"
              maxLength={140}
              value={storeDescription}
              onChange={(e) => setStoreDescription(e.target.value)}
              placeholder="Ex: Pães artesanais, cafés especiais e kits frescos entregues no mesmo dia em Porto Alegre."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5">
            <AddressAutocompleteFields
              idPrefix="vitrine-pickup"
              sectionLabel="Endereço de Retirada dos Pedidos (Origem do Frete)"
              value={storeAddr}
              onChange={(next) => setStoreAddr(next)}
              compact
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingStore}
              className="min-h-[40px] inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 whitespace-nowrap"
            >
              {isSavingStore
                ? 'Salvando configurações...'
                : 'Salvar Dados da Loja'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
