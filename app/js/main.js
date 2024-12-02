import {
    addProductRow,
    removeProductRow,
    addSupplierColumn,
    atualizarOuvintesTabCot,
    prenchTabCot,
} from './table_utils.js'
import {
    buscarFornecedores,
    buscarCentrosCusto,
    buscarClassesOperacionais
} from './dados_p_selects.js';
import {
    customModal,
    executar_apiZoho,
    formatToBRL,
    desabilitarCampos
} from './utils.js'
import {
    adicionarCampoVenc,
    removerCampoVenc,
    mostrarCamposPagamento,
    adicionarLinhaClassificacao,
    removerLinhaClassificacao,
    preencherDadosPDC,
    setupPixValidation,
    atualizarValorTotalParcelas,
    atualizarValorTotalClassificacoes,
    atualizarValorOriginal,
    calcularValorTotalPagar
} from './forms_utils.js';
import { CONFIG } from './config.js';
import { criarBotao } from './metodos_filtragem.js';

class Globais {
    constructor() {
        this.state = {
            baseClassesOperacionais: new Map(),
            baseFornecedores: new Map(),
            baseCentrosCusto: new Map(),
            idFornAprovado: null,
            ...CONFIG.INITIAL_STATE,
            ...CONFIG.APPS
        };

        return new Proxy(this.state, {
            get: (target, prop) => target[prop],
            set: (target, prop, value) => {
                target[prop] = value;
                return true;
            }
        });
    }
}
export const globais = new Globais();

// Inicia o processo
initGenericItems().catch(error => {
    console.error('Erro na inicialização:', error);
});

async function initGenericItems() {
    try {
        // 1. Cria a Promise do allSettled
        const basesPromise = Promise.allSettled([
            buscarFornecedores().then(result => { globais.baseFornecedores = result; }),
            buscarCentrosCusto().then(result => { globais.baseCentrosCusto = result; }),
            buscarClassesOperacionais().then(result => { globais.baseClassesOperacionais = result; adicionarLinhaClassificacao(); })
        ]);

        // 2. Executa searchPageParams e espera seu resultado
        const paramsResult = await searchPageParams();

        // 3. Se não estiver na página criar_cotacao, aguarda as bases carregarem
        if (globais.pag !== "criar_cotacao") {
            await basesPromise;
        } else {
            // Se estiver na página criar_cotacao, executa em background
            void basesPromise.catch(console.error);

        }

        // 4. Configura os ouvintes
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupListenersAndInit);
        } else {
            await setupListenersAndInit();
        }
    } catch (error) {
        console.error('Erro ao inicializar:', error);
    }
}

async function setupListenersAndInit() {
    // Configura os ouvintes
    const buttonActions = {
        "add-supplier-btn": { handler: () => addSupplierColumn(), type: 'click' },
        "add-product-btn": { handler: () => addProductRow(), type: 'click' },
        "remove-product-btn": { 
            handler: (elemento) => customModal({ 
                botao: elemento, 
                tipo: 'remover_produto', 
                mensagem: 'Deseja realmente remover este produto?' 
            }).then(() => { removeProductRow(elemento) }),
            type: 'click'
        },
        "save-btn": { 
            handler: (elemento) => customModal({ 
                botao: elemento, 
                mensagem: 'Deseja realmente salvar esta cotação?' 
            }),
            type: 'click'
        },
        "formas-pagamento": { handler: (elemento) => mostrarCamposPagamento(), type: 'click' },
        "add-parcela": { handler: () => adicionarCampoVenc(null, null, globais.numPDC), type: 'click' },
        "remover-parcela": { handler: (elemento) => removerCampoVenc(elemento), type: 'click' },
        "add-classificacao": { handler: () => adicionarLinhaClassificacao(), type: 'click' },
        "remover-classificacao": { handler: (elemento) => removerLinhaClassificacao(elemento), type: 'click' },
        "valor-parcela": { handler: (elemento) => { formatToBRL(elemento); atualizarValorTotalParcelas();}, type: 'blur' },
        "valor-classificacao": { handler: (elemento) => { formatToBRL(elemento); atualizarValorTotalClassificacoes();}, type: 'blur' },
        "campos-ret-desc":{handler: (elemento) => {calcularValorTotalPagar(); formatToBRL(elemento);}, type: 'blur'},
        "campos-ret-acr":{handler: (elemento) => {calcularValorTotalPagar(); formatToBRL(elemento);}, type: 'blur'},
        "": { handler: (elemento) => handleEnterKeyNavigation(elemento), type: 'keydown' }
    };

    /*
    "": { handler: () => setupPixValidation(), type: 'DOMContentLoaded' }
    */

    Object.entries(buttonActions).forEach(([className, config]) => {
        if (className === '') {
            // Para eventos globais como DOMContentLoaded
            if (config.type === 'DOMContentLoaded') {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', config.handler);
                } else {
                    config.handler();
                }
            } else {
                document.addEventListener(config.type, config.handler);
            }
        } else {
            // Para elementos específicos
            document.querySelectorAll(`.${className}`).forEach(elemento => {
                if (config.type === 'DOMContentLoaded') {
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', () => config.handler(elemento));
                    } else {
                        config.handler(elemento);
                    }
                } else {
                    elemento.addEventListener(config.type, () => config.handler(elemento));
                }
            });
        }
    });

    // Adicione esta linha
    setupSectionToggle();

    // 3. Inicia os processos em paralelo
    await executarProcessosParalelos();
}

async function executarProcessosParalelos() {

    if (globais.pag != "criar_cotacao" && globais.pag != "criar_cotacao_DP") {
        await ZOHO.CREATOR.init();

        // Executa processos em paralelo
        const tarefas = [
            processarDadosPDC(),
            processarDadosCotacao()
        ];

        await Promise.all(tarefas);
        console.log("[PÁGINA] => ", globais.pag);
        const saveBtnContainer = document.querySelector('.save-btn-container');
        if(globais.pag != "editar_cotacao" && globais.pag != "editar_cotacao_DP") {

            //desabilitarTodosElementosEditaveis();
            desabilitarCampos()
            if (globais.pag == "aprovar_cotacao") {
                criarBotao({page: "aprovar_cotacao", removeExistingButtons:true});

            }else if(globais.pag === "confirmar_compra")
            {
                criarBotao({page:globais.pag, removeExistingButtons: true});

            } else if (globais.pag === "criar_numero_de_PDC") 
            {
                criarBotao({page:globais.pag});

            }else if(globais.pag === "receber_compra")
            {
                criarBotao({page:globais.pag, removeExistingButtons: true});

            }else if(globais.pag === "ajustar_compra_compras" || globais.pag === "checagem_final" )
            {
                const camposNF = document.getElementById('section5');

                // Remove a classe 'hidden' da section-header que está acima de section5
                const sectionHeader = camposNF.previousElementSibling;
                console.log(sectionHeader);
                if (sectionHeader && sectionHeader.classList.contains('section-header')) {
                    sectionHeader.classList.remove("hidden");
                }

                camposNF.classList.remove("hidden");

                // Verifica se o tipo de solicitação é "SERVIÇO"
                const tipoSolicitacao = document.querySelector('select[name="Tipo_de_solicitacao"]').options[document.querySelector('select[name="Tipo_de_solicitacao"]').selectedIndex].text;

                if (tipoSolicitacao === "SERVIÇO") {

                    camposNF.querySelectorAll('*').forEach(child => child.classList.remove("hidden"));
                }else{

                    camposNF.querySelector('.campos-iniciais-nf').classList.remove("hidden");
                }
                criarBotao({page:globais.pag});

                if(globais.pag === "checagem_final")
                {
                    //MOSTRA OS CAMPOS DE ARQUIVO//
                }

            }else if (globais.pag == "autorizar_pagamento_subsindico" || globais.pag == "autorizar_pagamento_sindico" || globais.pag == "confirmar_todas_as_assinaturas") {
                criarBotao({page: globais.pag, removeExistingButtons: true});

            }else if(globais.pag === "arquivar_cotacao")
            {
                criarBotao({page: globais.pag, removeExistingButtons:true});
            }
            else
            {
                criarBotao({removeExistingButtons:true});
            }
        }
        else 
        {
            criarBotao({page:globais.pag});
        }
    }else
    {
        criarBotao({page: globais.pag});
    }
    document.body.classList.remove('hidden');
    atualizarOuvintesTabCot();
}

async function processarDadosPDC() {
    console.log("[======PROCESSANDO PDC======]");
    //const cPDC = "(" + (globais.numPDC ? `numero_de_PDC=="${globais.numPDC}"` : (globais.numPDC_temp ? `id_temp=="${globais.numPDC_temp}"` : "ID==0")) + ")";
    const cPDC = "(" + globais.numPDC_temp?`id_temp=="${globais.numPDC_temp}")`:"ID==0)";
    const respPDC = await executar_apiZoho({ 
        tipo: "busc_reg", 
        criterios: cPDC, 
        nomeR: globais.nomeRelPDC 
    });

    if (respPDC.code == 3000) {
        
        globais.tipo = 'editar_pdc';
        console.log(JSON.stringify(respPDC));
        preencherDadosPDC(respPDC);
    } else {
        console.log("Não tem PDC");
    }
}

async function processarDadosCotacao() {
    //const idCriterio = globais.numPDC ? `numero_de_PDC=="${globais.numPDC}"` : (globais.numPDC_temp ?`num_PDC_temp=="${globais.numPDC_temp}"` :"ID==0");
    const idCriterio = "(" + globais.numPDC_temp ?`num_PDC_temp=="${globais.numPDC_temp}")` :"ID==0)";

    const aprovadoCriterio = !["editar_cotacao", "aprovar_cotacao", "ver_cotacao"].includes(globais.pag) ? 
        " && Aprovado==true" : "";
    console.log("pag => ", globais.pag);
    
    let cCot = `(${idCriterio} && Ativo==true${aprovadoCriterio})`;
    console.log("Criterio => ", cCot);
    const respCot = await executar_apiZoho({ 
        tipo: "busc_reg", 
        criterios: cCot, 
        nomeR: globais.nomeRelCot 
    });

    if (respCot.code == 3000) {

        await prenchTabCot(respCot);
        atualizarValorOriginal();
        calcularValorTotalPagar();
    } else {
        console.log("Não tem Cotação");
    }
}

/**
 * Adiciona navegação por pontos (dots) para as seções da página
 * 
 * @function addNavDots
 * @returns {void}
 * 
 * @description
 * Esta função implementa:
 * 1. Observador de interseção para detectar seções visíveis
 * 2. Atualização automática dos pontos de navegação
 * 3. Navegação suave ao clicar nos pontos
 * 
 * Funcionalidades:
 * - Monitora a visibilidade das seções usando IntersectionObserver
 * - Atualiza o ponto ativo quando uma seção está 50% visível
 * - Permite navegação suave ao clicar nos pontos
 * - Usa margem de detecção para melhor precisão
 * 
 * @example
 * // Adiciona navegação por pontos à página
 * addNavDots();
 */
function addNavDots() {
    // Adiciona o observer para as seções
    const sections = document.querySelectorAll('.section');
    const dots = document.querySelectorAll('.dot');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove a classe active de todos os dots
                dots.forEach(dot => dot.classList.remove('active'));

                // Adiciona a classe active ao dot correspondente
                const sectionId = entry.target.id.replace('section', '');
                const activeDot = document.querySelector(`.dot[data-section="${sectionId}"]`);
                if (activeDot) {
                    activeDot.classList.add('active');
                }
            }
        });
    }, {
        threshold: 0.5, // Ativa quando 50% da seção está visível
        rootMargin: '-10% 0px -10% 0px' // Cria uma margem de detecção
    });

    // Observa todas as seções
    sections.forEach(section => observer.observe(section));

    // Adiciona click event nos dots para navegaço suave
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const sectionId = dot.dataset.section;
            const targetSection = document.getElementById(`section${sectionId}`);
            targetSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    });
}

async function searchPageParams() {
    await ZOHO.CREATOR.init()
        .then(() => ZOHO.CREATOR.UTIL.getQueryParams())
        .then(params => {
            if (params) {
                if (params.idPdc) {
                    globais.numPDC = params.idPdc;
                }
                if (params.num_PDC_temp) {
                    globais.numPDC_temp = params.num_PDC_temp;
                }
                if (params.pag) {
                    globais.pag = params.pag;
                }
            }
        });
}

/**
 * Configura o comportamento de alternância (toggle) para as seções da página
 * 
 * Esta função adiciona event listeners aos cabeçalhos das seções para permitir
 * que o usuário expanda/recolha o conteúdo clicando neles.
 * 
 * Para cada cabeçalho de seção (.section-header):
 * - Adiciona um listener de clique
 * - Quando clicado, alterna a classe 'collapsed' tanto no cabeçalho quanto na seção
 * - A classe 'collapsed' controla a visibilidade/animação através do CSS
 */
function setupSectionToggle() {
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.nextElementSibling;
            if (section && section.classList.contains('section')) {
                section.classList.toggle('collapsed');
                header.classList.toggle('collapsed'); 
            }
        });
    });
}

// Adicionar esta nova função
function handleEnterKeyNavigation(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Previne a quebra de linha em textareas
        
        const activeElement = document.activeElement;
        const isShiftPressed = event.shiftKey;
        
        // Verifica se é uma célula da tabela
        if (activeElement.closest('td')) {
            const currentCell = activeElement;
            const currentRow = currentCell.parentElement;
            const currentIndex = Array.from(currentRow.cells).indexOf(currentCell);
            const targetRow = isShiftPressed ? currentRow.previousElementSibling : currentRow.nextElementSibling;
            
            // Verifica se a linha alvo existe e não é uma linha especial
            if (targetRow && !targetRow.classList.contains('linhas-totalizadoras') && !targetRow.classList.contains('borda-oculta')) {
                const targetCell = targetRow.cells[currentIndex];
                if (targetCell && targetCell.hasAttribute('contenteditable')) {
                    targetCell.focus();
                    // Seleciona todo o conteúdo da célula
                    window.getSelection().selectAllChildren(targetCell);
                }
            }
        }

        // Verifica se é um input ou textarea em um formulário
        else if (activeElement.matches('input, textarea, select')) {
            const form = activeElement.closest('form');
            if (form) {
                const inputs = Array.from(form.querySelectorAll('input:not([type="radio"]), textarea, select'));
                const currentIndex = inputs.indexOf(activeElement);
                
                // Define o índice do próximo input baseado na direção
                const targetIndex = isShiftPressed ? currentIndex - 1 : currentIndex + 1;
                
                // Verifica se o índice alvo é válido
                if (targetIndex >= 0 && targetIndex < inputs.length) {
                    const targetInput = inputs[targetIndex];
                    targetInput.focus();
                    // Seleciona todo o conteúdo do input/textarea
                    targetInput.select();
                }
            }
        }
    }
}