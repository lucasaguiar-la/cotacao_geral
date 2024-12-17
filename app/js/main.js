import {
    atualizarOuvintesTabCot,
    addSupplierColumn,
    removeProductRow,
    addProductRow,
    prenchTabCot,
} from './table_utils.js'
import {
    buscarClassesOperacionais,
    buscarFornecedores,
    buscarCentrosCusto,
    
} from './dados_p_selects.js';
import {
    desabilitarCampos,
    executar_apiZoho,
    customModal,
    formatToBRL
} from './utils.js'
import {
    atualizarValorTotalClassificacoes,
    atualizarValorTotalParcelas,
    adicionarLinhaClassificacao,
    removerLinhaClassificacao,
    calcularValorTotalPagar,
    atualizarValorOriginal,
    preencherListaAnexosV2,
    mostrarCamposPagamento,
    adicionarCampoVenc,
    setupPixValidation,
    preencherDadosPDC,
    removerCampoVenc
} from './forms_utils.js';
import { CONFIG } from './config.js';
import { criarBotao } from './metodos_filtragem.js';

class Globais {
    constructor() {
        this.state = {
            baseClassesOperacionais: new Map(),
            baseFornecedores: new Map(),
            baseCentrosCusto: new Map(),
            idsCotacao: new Array(),
            arquivosGaleria: [],
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

const qlt = 4;
// Inicia o processo
initGenericItems().catch(error => {
    console.error('Erro na inicialização:', error);
});

async function initGenericItems() {

    try {
        // 1. Executa searchPageParams e espera seu resultado
        await searchPageParams();

        // 2. Cria a Promise do allSettled
        const basesPromise = Promise.allSettled([
            buscarFornecedores().then(result => { globais.baseFornecedores = result; }),
            buscarCentrosCusto().then(result => { globais.baseCentrosCusto = result; }),
            buscarClassesOperacionais().then(result => { globais.baseClassesOperacionais = result; adicionarLinhaClassificacao(); })
        ]);

        // 3. Se não estiver na página criar_cotacao, aguarda as bases carregarem
        if (!globais.pag.includes('criar_cotacao')) {
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
            }).then(() => { removeProductRow(elemento);}),
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

    if (!globais.pag.includes('criar_cotacao')) {
        await ZOHO.CREATOR.init();

        // Executa processos em paralelo
        const tarefas = [
            processarDadosPDC(),
            processarDadosCotacao()
        ];

        await Promise.all(tarefas);
        if(!globais.pag.includes('editar_cotacao')) {

            
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
            //desabilitarTodosElementosEditaveis();
            desabilitarCampos()
        }
        else 
        {
            criarBotao({page:globais.pag});
        }
    }else
    {
        preencherListaAnexosV2();
        
        criarBotao({page: globais.pag});

        if(globais.pag.includes("_DP"))
        {
            // Remove todos os event listeners do botão com a classe save-btn
            const saveButton = document.querySelector('.save-btn');
            const newSaveButton = saveButton.cloneNode(true); // Clona o botão para preservar o estado
            saveButton.parentNode.replaceChild(newSaveButton, saveButton); // Substitui o botão original

            // Adiciona um novo evento de clique
            newSaveButton.addEventListener('click', () => {
                customModal({botao:newSaveButton, tipo: "criar_cotacao_DP", mensagem:"Deseja realmente salvar este registro?"});
            });

            /*SELECIONAVA O FORNECEDOR A PARTIR DO CAMPO TIPO, MUDOU PARA BOTÃO DE ADD FORN, SE NÃO DEU ERRO PODE EXCLUIR
            const entidadeSelect = document.getElementById('tipo');
            const opcoes = [
                { value: '', text: 'Selecione...', disabled: true, selected: true, id_forn: null },
                { value: '3938561000087230717', text: 'FOLHA DE PAGAMENTO', id_forn: 1206 },
                { value: '3938561000087786617', text: 'ADIANTAMENTO SALARIAL', id_forn: 1684},
                { value: '3938561000069174082', text: 'FÉRIAS', id_forn: 1148},
                { value: '3938561000069356031', text: 'RESCISÃO CONTRATUAL', id_forn: 1177},
                { value: '3938561000071216432', text: 'ADIANTAMENTO 1ª PARCELA 13º SALÁRIO', id_forn: 1313},
                { value: '3938561000086192829', text: 'ADIANTAMENTO 2ª PARCELA 13º SALÁRIO', id_forn: 1643},
                { value: '3938561000085830084', text: '1ª PARCELA 13º SALÁRIO', id_forn: 1636},
                { value: '3938561000087620085', text: '2º PARCELA 13º SALÁRIO', id_forn: 1682},
                { value: '3938561000080428170', text: 'INSS FOLHA DE PAGAMENTO', id_forn: 1555},
                { value: '3938561000080426996', text: 'FGTS FOLHA DE PAGAMENTO', id_forn: 1553},
                { value: '3938561000087786625', text: 'PENSÃO ALIMENTÍCIA', id_forn: 1686},
                { value: '3938561000087786621', text: 'INSS CONTRIBUINTE INDIVIDUAL', id_forn: 1685},
                { value: '3938561000087786629', text: 'IRRF FOLHA DE PAGAMENTO', id_forn: 1687},
                { value: '3938561000087786645', text: 'IRRF FÉRIAS', id_forn: 1691},
                { value: '3938561000087786649', text: 'IRRF 13º SALÁRIO', id_forn: 1692},
                { value: '3938561000087786633', text: 'PIS FOLHA DE PAGAMENTO', id_forn: 1688},
                { value: '3938561000087786653', text: 'PIS 13º SALARIO', id_forn: 1693},
                { value: '3938561000087786637', text: 'FGTS RESCISÃO', id_forn: 1689},  
                { value: '3938561000087786641', text: 'FGTS 13º SALÁRIO', id_forn: 1690},
                { value: '3938561000087786657', text: 'ASSISTÊNCIA MÉDICA', id_forn: 1694},
                { value: '3938561000087786661', text: 'ASSISTÊNCIA ODONTOLÓGICA', id_forn: 1695},
                { value: '3938561000087786665', text: 'SEGURO DE VIDA EM GRUPO', id_forn: 1696},
                { value: '3938561000087786669', text: 'SERVIÇOS DE SAÚDE E SEGURANÇA DO TRABALHO', id_forn: 1697},
                { value: '3938561000087786673', text: 'CURSO JOVEM APRENDIZ', id_forn: 1698},
                { value: '3938561000087786677', text: 'TRANSPORTE DE FUNCIONÁRIOS', id_forn: 1699},
                { value: '3938561000087786681', text: 'EMPRÉSTIMO CONSIGNADO', id_forn: 1700},
                { value: '3938561000087786685', text: 'SISTEMA GESTÃO FOLHA DE PAGAMENTO', id_forn: 1701},
                { value: '3938561000087786689', text: 'SISTEMA GESTÃO PONTO ELETRÔNICO', id_forn: 1702},
                { value: '3938561000087786693', text: 'CONVÊNIO FARMÁCIA', id_forn: 1703}
                // Adicione mais opções aqui conforme necessário
            ];

            // Armazena a opção selecionada, se houver
            const opcaoSelecionada = entidadeSelect.value;

            // Limpa as opções existentes
            entidadeSelect.innerHTML = '';

            // Adiciona as novas opções da coleção
            opcoes.forEach(opcao => {
                const optionElement = document.createElement('option');
                optionElement.value = opcao.value;
                optionElement.textContent = opcao.text;
                optionElement.disabled = opcao.disabled;
                optionElement.selected = opcao.selected;
                entidadeSelect.appendChild(optionElement);
            });

            // Restaura a opção selecionada, se houver
            if (opcaoSelecionada) {
                entidadeSelect.value = opcaoSelecionada;
            }

            // Adicionar evento para executar ação ao selecionar uma opção
            entidadeSelect.addEventListener('change', (event) => {
                const valorSelecionado = event.target.value;
                const fornecedor = opcoes.find(opcao => opcao.value === valorSelecionado);

                if (fornecedor) {
                    
                    globais.idFornAprovado = fornecedor.value;

                    const nomeCompletoFornecedor = fornecedor.text;
                    const nome_forn = nomeCompletoFornecedor;
                    const idForn = fornecedor.id_forn; // Obtém o id_forn

                    const tab = document.getElementById('priceTable');
                    const cabecalhoLinha1 = tab.rows[0];
                    const cabecalhoLinha2 = tab.rows[1];

                    //==========Criação das Colunas do Fornecedor==========//
                    const celulaCabecalho = document.createElement('th');
                    celulaCabecalho.colSpan = 2;
                    celulaCabecalho.dataset.id_forn = idForn; // Usa o id_forn aqui
                    celulaCabecalho.title = `${nomeCompletoFornecedor}`;

                    const nomeFornText = document.createElement('div');
                    nomeFornText.innerText = nome_forn;
                    nomeFornText.style.margin = '0px auto';

                    // Montagem do container do fornecedor
                    const container = document.createElement('div');
                    container.classList.add('container-fornecedor');
                    container.style.display = 'flex';
                    container.style.alignItems = 'center';
                    container.style.justifyContent = 'space-between';
                    container.style.gap = '5px';

                    // Checkbox de seleção do fornecedor
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.classList.add('supplier-checkbox');
                    checkbox.checked = true;
                    checkbox.disabled = true;
                    globais.selectedCheckbox = checkbox;

                    container.appendChild(checkbox);
                    container.appendChild(nomeFornText);
                    celulaCabecalho.appendChild(container);
                    celulaCabecalho.style.position = 'relative';

                    // Inserção das colunas no cabeçalho
                    cabecalhoLinha1.insertBefore(celulaCabecalho, cabecalhoLinha1.cells[cabecalhoLinha1.cells.length -1]);

                    const celulaPrecoUnitario = document.createElement('th');
                    celulaPrecoUnitario.innerText = 'Valor Unitário';
                    cabecalhoLinha2.insertBefore(celulaPrecoUnitario, cabecalhoLinha2.cells[cabecalhoLinha2.cells.length -1]);

                    const celulaPrecoTotal = document.createElement('th');
                    celulaPrecoTotal.innerText = 'Valor Total';
                    cabecalhoLinha2.insertBefore(celulaPrecoTotal, cabecalhoLinha2.cells[cabecalhoLinha2.cells.length -1]);

                    //==========Adição das Células nas Linhas==========//
                    const linhas = tab.getElementsByTagName('tbody')[0].rows;
                    for (let i = 0; i < linhas.length - 1; i++) {
                        if(i < linhas.length - qlt) {
                            // Células para produtos
                            const celulaPrecoUnitarioLinha = linhas[i].insertCell(linhas[i].cells.length - 1);
                            celulaPrecoUnitarioLinha.contentEditable = "true";
                            celulaPrecoUnitarioLinha.classList.add('numeric-cell', 'valor-unit');

                            const celulaPrecoTotalLinha = linhas[i].insertCell(linhas[i].cells.length - 1);
                            celulaPrecoTotalLinha.classList.add('numeric-cell');
                        } else {
                            // Células para totalizadores
                            const celulaTotalizadora = linhas[i].insertCell(linhas[i].cells.length - 1);

                            if(i >= (linhas.length-4) && i < (linhas.length-2)) {
                                celulaTotalizadora.contentEditable = "true";
                            } else if(i == (linhas.length-2)) {
                                celulaTotalizadora.classList.add("total-fornecedor");
                                celulaTotalizadora.contentEditable = "false";
                            }
                            celulaTotalizadora.classList.add('numeric-cell');
                            celulaTotalizadora.colSpan = 2;
                        }
                    }

                    //==========Atualização da tab de Dados Adicionais==========//
                    const otherTableBody = document.getElementById('otherDataTable').getElementsByTagName('tbody')[0];

                    if (otherTableBody.rows.length === 1 && !otherTableBody.rows[0].cells[0].textContent.trim()) {
                        otherTableBody.deleteRow(0);
                    }

                    const newRow = otherTableBody.insertRow();
                    const fornecedorCell = newRow.insertCell(0);
                    fornecedorCell.innerText = nome_forn;
                    fornecedorCell.dataset.id_forn = idForn;

                    const condicoesPagamentoCell = newRow.insertCell(1);
                    const observacoesCell = newRow.insertCell(2);

                    [condicoesPagamentoCell, observacoesCell].forEach(cell => {
                        cell.contentEditable = "true";
                        cell.classList.add('editable-cell');
                    });

                    atualizarOuvintesTabCot();
                }
            });
            */
        }
    }
    document.body.classList.remove('hidden');
    atualizarOuvintesTabCot();
    atualizarValorTotalParcelas();
    atualizarValorTotalClassificacoes();

}

async function processarDadosPDC() {
    //const cPDC = "(" + (globais.numPDC ? `numero_de_PDC=="${globais.numPDC}"` : (globais.numPDC_temp ? `id_temp=="${globais.numPDC_temp}"` : "ID==0")) + ")";
    const cPDC = "(" + globais.numPDC_temp?`id_temp=="${globais.numPDC_temp}")`:"ID==0)";
    const respPDC = await executar_apiZoho({ 
        tipo: "busc_reg", 
        criterios: cPDC, 
        nomeR: globais.nomeRelPDC 
    });

    if (respPDC.code == 3000) {
        
        globais.tipo = 'editar_pdc';
        preencherDadosPDC(respPDC);
    }
}

async function processarDadosCotacao() {
    //const idCriterio = globais.numPDC ? `numero_de_PDC=="${globais.numPDC}"` : (globais.numPDC_temp ?`num_PDC_temp=="${globais.numPDC_temp}"` :"ID==0");
    const idCriterio =  globais.numPDC_temp ?`num_PDC_temp=="${globais.numPDC_temp}"` :"ID==0";

    const aprovadoCriterio = !["editar_cotacao", "aprovar_cotacao", "ver_cotacao", "editar_cotacao_DP"].includes(globais.pag) ? 
        " && Aprovado==true" : "";
    
    let cCot = `(${idCriterio} && Ativo==true${aprovadoCriterio})`;
    const respCot = await executar_apiZoho({ 
        tipo: "busc_reg", 
        criterios: cCot, 
        nomeR: globais.nomeRelCot 
    });

    if (respCot.code == 3000) {

        prenchTabCot(respCot);
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